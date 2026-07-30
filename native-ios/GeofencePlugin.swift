// Xcodeで ios/App/App/ に追加するファイル（Target: App）
// App Group（group.jp.brainbox.app）はWidgetDataPluginと共有で使う（同じCapability設定でOK）
import Capacitor
import CoreLocation
import UserNotifications

private struct GeofenceLocationEntry: Codable { let id: String; let name: String; let lat: Double; let lng: Double; let radius: Double }
private struct WidgetShopEntry: Codable { let id: String; let name: String }

@objc(GeofencePlugin)
public class GeofencePlugin: CAPPlugin, CLLocationManagerDelegate, UNUserNotificationCenterDelegate {
    static let appGroupId = "group.jp.brainbox.app"
    static let regionPrefix = "shop-"
    // 同じ場所への接近で通知を連発しないためのクールダウン（秒）
    static let notifyCooldown: TimeInterval = 2 * 60 * 60

    private let locationManager = CLLocationManager()
    // getCurrentLocation() 呼び出し中の CAPPluginCall（requestLocation() の結果は
    // delegate の didUpdateLocations/didFailWithError で非同期に返ってくるため保持しておく）
    private var pendingLocationCalls: [CAPPluginCall] = []

    public override func load() {
        locationManager.delegate = self
        UNUserNotificationCenter.current().delegate = self
    }

    // navigator.geolocation（WKWebView標準API）はWKWebView環境下では権限が許可済みでも
    // コールバックが一切呼ばれずに固まることがある実際の不具合を確認したため、
    // CLLocationManager.requestLocation() を直接使うネイティブ実装に切り替えた
    @objc func getCurrentLocation(_ call: CAPPluginCall) {
        switch locationManager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            pendingLocationCalls.append(call)
            locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters
            locationManager.requestLocation()
        case .notDetermined:
            // まだ一度も許可をリクエストしていない場合はここでリクエストし、
            // 結果はlocationManagerDidChangeAuthorizationで受け取ってから位置取得を続行する
            pendingLocationCalls.append(call)
            locationManager.requestWhenInUseAuthorization()
        default:
            call.reject("location permission not granted")
        }
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard !pendingLocationCalls.isEmpty else { return }
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
            manager.requestLocation()
        case .denied, .restricted:
            let calls = pendingLocationCalls
            pendingLocationCalls = []
            for call in calls { call.reject("location permission not granted") }
        default:
            break
        }
    }

    @objc public override func requestPermissions(_ call: CAPPluginCall) {
        locationManager.requestAlwaysAuthorization()
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
            self.currentStatus { call.resolve($0) }
        }
    }

    @objc public override func checkPermissions(_ call: CAPPluginCall) {
        currentStatus { call.resolve($0) }
    }

    private func currentStatus(_ completion: @escaping ([String: String]) -> Void) {
        let locStatus: String
        switch locationManager.authorizationStatus {
        case .authorizedAlways: locStatus = "granted"
        case .denied, .restricted: locStatus = "denied"
        case .authorizedWhenInUse: locStatus = "limited"
        default: locStatus = "prompt"
        }
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let notifStatus: String
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral: notifStatus = "granted"
            case .denied: notifStatus = "denied"
            default: notifStatus = "prompt"
            }
            completion(["location": locStatus, "notifications": notifStatus])
        }
    }

    @objc func setGeofences(_ call: CAPPluginCall) {
        let json = call.getString("locationsJson") ?? "[]"
        guard let data = json.data(using: .utf8),
              let entries = try? JSONDecoder().decode([GeofenceLocationEntry].self, from: data) else {
            call.reject("invalid locationsJson")
            return
        }
        for region in locationManager.monitoredRegions where region.identifier.hasPrefix(GeofencePlugin.regionPrefix) {
            locationManager.stopMonitoring(for: region)
        }
        var names: [String: String] = [:]
        for entry in entries {
            let region = CLCircularRegion(
                center: CLLocationCoordinate2D(latitude: entry.lat, longitude: entry.lng),
                radius: entry.radius,
                identifier: GeofencePlugin.regionPrefix + entry.id
            )
            region.notifyOnEntry = true
            region.notifyOnExit = false
            locationManager.startMonitoring(for: region)
            names[entry.id] = entry.name
        }
        if let data = try? JSONEncoder().encode(names), let json = String(data: data, encoding: .utf8) {
            UserDefaults.standard.set(json, forKey: "geofenceNames")
        }
        call.resolve()
    }

    @objc func getPendingGeofenceAction(_ call: CAPPluginCall) {
        let shouldOpen = UserDefaults.standard.bool(forKey: "pendingOpenShopList")
        UserDefaults.standard.removeObject(forKey: "pendingOpenShopList")
        call.resolve(["shouldOpenShop": shouldOpen])
    }

    // MARK: - CLLocationManagerDelegate

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last, !pendingLocationCalls.isEmpty else { return }
        let calls = pendingLocationCalls
        pendingLocationCalls = []
        for call in calls {
            call.resolve(["lat": loc.coordinate.latitude, "lng": loc.coordinate.longitude])
        }
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard !pendingLocationCalls.isEmpty else { return }
        let calls = pendingLocationCalls
        pendingLocationCalls = []
        for call in calls {
            call.reject("failed to get location: \(error.localizedDescription)")
        }
    }

    public func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        guard region.identifier.hasPrefix(GeofencePlugin.regionPrefix) else { return }
        let locId = String(region.identifier.dropFirst(GeofencePlugin.regionPrefix.count))

        let defaults = UserDefaults.standard
        let cooldownKey = "geofenceLastNotified_\(locId)"
        let now = Date().timeIntervalSince1970
        if let last = defaults.object(forKey: cooldownKey) as? Double, now - last < GeofencePlugin.notifyCooldown {
            return
        }

        guard let groupDefaults = UserDefaults(suiteName: GeofencePlugin.appGroupId),
              let shopJson = groupDefaults.string(forKey: "widgetShopJson"),
              let shopData = shopJson.data(using: .utf8),
              let items = try? JSONDecoder().decode([WidgetShopEntry].self, from: shopData),
              !items.isEmpty else { return }

        defaults.set(now, forKey: cooldownKey)

        var placeName = "登録した場所"
        if let namesJson = defaults.string(forKey: "geofenceNames"),
           let namesData = namesJson.data(using: .utf8),
           let names = try? JSONDecoder().decode([String: String].self, from: namesData),
           let n = names[locId] {
            placeName = n
        }

        let names = items.prefix(5).map { $0.name }.joined(separator: "、")
        let body = items.count > 5 ? "\(names) 他\(items.count - 5)件" : names

        let content = UNMutableNotificationContent()
        content.title = "\(placeName)の近くです"
        content.body = "買い物リスト: \(body)"
        content.sound = .default
        content.userInfo = ["openShop": true]
        let request = UNNotificationRequest(
            identifier: "shop-geofence-\(locId)-\(Int(now))",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
    }

    // MARK: - UNUserNotificationCenterDelegate

    public func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list])
    }

    public func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        if response.notification.request.content.userInfo["openShop"] as? Bool == true {
            UserDefaults.standard.set(true, forKey: "pendingOpenShopList")
        }
        completionHandler()
    }
}

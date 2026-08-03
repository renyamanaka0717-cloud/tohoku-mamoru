// Xcodeで ios/App/App/ に追加するファイル（Target: App）
// App Group（group.jp.brainbox.app）はWidgetDataPluginと共有で使う（同じCapability設定でOK）
import Capacitor
import CoreLocation
import UserNotifications
import UIKit

private struct GeofenceLocationEntry: Codable { let id: String; let name: String; let lat: Double; let lng: Double; let radius: Double }
private struct WidgetShopEntry: Codable { let id: String; let name: String }

@objc(GeofencePlugin)
public class GeofencePlugin: CAPPlugin, CLLocationManagerDelegate, UNUserNotificationCenterDelegate {
    static let appGroupId = "group.jp.brainbox.app"
    static let regionPrefix = "shop-"
    static let taskLocPrefix = "task-loc-"
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
        NSLog("[BB-LOC] getCurrentLocation called, status=\(locationManager.authorizationStatus.rawValue)")
        switch locationManager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            pendingLocationCalls.append(call)
            locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters
            NSLog("[BB-LOC] calling requestLocation()")
            locationManager.requestLocation()
        case .notDetermined:
            // まだ一度も許可をリクエストしていない場合はここでリクエストし、
            // 結果はlocationManagerDidChangeAuthorizationで受け取ってから位置取得を続行する
            pendingLocationCalls.append(call)
            NSLog("[BB-LOC] calling requestWhenInUseAuthorization()")
            locationManager.requestWhenInUseAuthorization()
        default:
            NSLog("[BB-LOC] rejected immediately, status not authorized")
            call.reject("location permission not granted")
        }
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        NSLog("[BB-LOC] locationManagerDidChangeAuthorization, status=\(manager.authorizationStatus.rawValue), pendingCount=\(pendingLocationCalls.count)")
        guard !pendingLocationCalls.isEmpty else { return }
        switch manager.authorizationStatus {
        case .authorizedAlways, .authorizedWhenInUse:
            manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
            NSLog("[BB-LOC] calling requestLocation() from authorization change")
            manager.requestLocation()
        case .denied, .restricted:
            NSLog("[BB-LOC] permission denied after prompt")
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

    // 「あとでやる」タスクの場所通知。setGeofences（買い物リスト用）と同じ全解除→再登録方式だが、
    // "task-loc-" prefixで別管理し、通知内容用にタスク名を "taskLocationNames" に保存する
    @objc func setTaskLocationGeofences(_ call: CAPPluginCall) {
        let json = call.getString("locationsJson") ?? "[]"
        guard let data = json.data(using: .utf8),
              let entries = try? JSONDecoder().decode([GeofenceLocationEntry].self, from: data) else {
            call.reject("invalid locationsJson")
            return
        }
        for region in locationManager.monitoredRegions where region.identifier.hasPrefix(GeofencePlugin.taskLocPrefix) {
            locationManager.stopMonitoring(for: region)
        }
        var names: [String: String] = [:]
        for entry in entries {
            // 発火済みのタスクは、アプリがフォアグラウンドに戻って
            // getFiredTaskLocationIds() が処理する（JS側でlocationNotifyがfalseになる）まで
            // 再登録しない。バックグラウンド中に他の理由でこの関数が再度呼ばれても
            // 発火済みリージョンが誤って再武装されるのを防ぐため
            if UserDefaults.standard.bool(forKey: "taskLocationFired_\(entry.id)") { continue }
            let region = CLCircularRegion(
                center: CLLocationCoordinate2D(latitude: entry.lat, longitude: entry.lng),
                radius: entry.radius,
                identifier: GeofencePlugin.taskLocPrefix + entry.id
            )
            region.notifyOnEntry = true
            region.notifyOnExit = false
            locationManager.startMonitoring(for: region)
            names[entry.id] = entry.name
        }
        if let data = try? JSONEncoder().encode(names), let json = String(data: data, encoding: .utf8) {
            UserDefaults.standard.set(json, forKey: "taskLocationNames")
        }
        call.resolve()
    }

    // アプリがフォアグラウンドに戻ったタイミングでJS側から呼ばれる。バックグラウンド中に
    // 場所到着で発火済みのタスクID一覧を返し、読み取り後はネイティブ側のフラグをクリアする
    // （JS側はこれを受けて該当タスクのlocationNotifyをfalseにし、以後の再登録対象から外す）
    @objc func getFiredTaskLocationIds(_ call: CAPPluginCall) {
        let defaults = UserDefaults.standard
        let ids = defaults.string(forKey: "taskLocationFiredIds")
        var idList: [String] = []
        if let ids = ids, let data = ids.data(using: .utf8), let arr = try? JSONDecoder().decode([String].self, from: data) {
            idList = arr
        }
        for id in idList { defaults.removeObject(forKey: "taskLocationFired_\(id)") }
        defaults.removeObject(forKey: "taskLocationFiredIds")
        call.resolve(["ids": idList])
    }

    @objc func getPendingGeofenceAction(_ call: CAPPluginCall) {
        let shouldOpenShop = UserDefaults.standard.bool(forKey: "pendingOpenShopList")
        let shouldOpenLater = UserDefaults.standard.bool(forKey: "pendingOpenLaterList")
        UserDefaults.standard.removeObject(forKey: "pendingOpenShopList")
        UserDefaults.standard.removeObject(forKey: "pendingOpenLaterList")
        call.resolve(["shouldOpenShop": shouldOpenShop, "shouldOpenLater": shouldOpenLater])
    }

    // iOSは位置情報・通知の許可をアプリから直接ONにするAPIを提供していないため、
    // 「設定アプリ > このアプリ」のページを直接開くところまでをワンタップで行う
    @objc func openAppSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
        }
        call.resolve()
    }

    // MARK: - CLLocationManagerDelegate

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        NSLog("[BB-LOC] didUpdateLocations, count=\(locations.count), pendingCount=\(pendingLocationCalls.count)")
        guard let loc = locations.last, !pendingLocationCalls.isEmpty else { return }
        let calls = pendingLocationCalls
        pendingLocationCalls = []
        for call in calls {
            call.resolve(["lat": loc.coordinate.latitude, "lng": loc.coordinate.longitude])
        }
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        NSLog("[BB-LOC] didFailWithError: \(error.localizedDescription), pendingCount=\(pendingLocationCalls.count)")
        guard !pendingLocationCalls.isEmpty else { return }
        let calls = pendingLocationCalls
        pendingLocationCalls = []
        for call in calls {
            call.reject("failed to get location: \(error.localizedDescription)")
        }
    }

    public func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        if region.identifier.hasPrefix(GeofencePlugin.taskLocPrefix) {
            handleTaskLocationEnter(region)
            return
        }
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

    // 「あとでやる」タスクの場所通知。時間通知（task-alert-）とOR条件のため、
    // 発火したらこのタスクの残りの時間通知予約を解除し、このリージョンの監視も止める（1タスク1回のみ）
    private func handleTaskLocationEnter(_ region: CLRegion) {
        let taskId = String(region.identifier.dropFirst(GeofencePlugin.taskLocPrefix.count))
        let defaults = UserDefaults.standard
        let firedKey = "taskLocationFired_\(taskId)"
        if defaults.bool(forKey: firedKey) { return }
        defaults.set(true, forKey: firedKey)

        var firedIds: [String] = []
        if let idsJson = defaults.string(forKey: "taskLocationFiredIds"),
           let idsData = idsJson.data(using: .utf8),
           let arr = try? JSONDecoder().decode([String].self, from: idsData) {
            firedIds = arr
        }
        firedIds.append(taskId)
        if let data = try? JSONEncoder().encode(firedIds), let json = String(data: data, encoding: .utf8) {
            defaults.set(json, forKey: "taskLocationFiredIds")
        }

        var taskName = "あとでやるタスク"
        if let namesJson = defaults.string(forKey: "taskLocationNames"),
           let namesData = namesJson.data(using: .utf8),
           let names = try? JSONDecoder().decode([String: String].self, from: namesData),
           let n = names[taskId] {
            taskName = n
        }

        let content = UNMutableNotificationContent()
        content.title = taskName
        content.body = "この場所に着きました。"
        content.sound = .default
        content.userInfo = ["openLater": true]
        let request = UNNotificationRequest(identifier: "task-loc-fire-\(taskId)-\(Int(Date().timeIntervalSince1970))", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)

        if let circular = region as? CLCircularRegion {
            locationManager.stopMonitoring(for: circular)
        }

        // 時間通知（task-alert-<taskId>-<分オフセット>）が残っていれば解除する（OR条件の重複防止）
        let center = UNUserNotificationCenter.current()
        let alertPrefix = "task-alert-\(taskId)-"
        center.getPendingNotificationRequests { requests in
            let staleIds = requests.map { $0.identifier }.filter { $0.hasPrefix(alertPrefix) }
            if !staleIds.isEmpty {
                center.removePendingNotificationRequests(withIdentifiers: staleIds)
            }
        }
    }

    // MARK: - UNUserNotificationCenterDelegate

    public func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        // アプリがフォアグラウンドの間に時間通知（task-alert-）が発火した場合、
        // OR条件のもう片方である場所通知（task-loc-）の監視を止める（重複防止）
        let id = notification.request.identifier
        if id.hasPrefix("task-alert-") {
            let rest = String(id.dropFirst("task-alert-".count))
            if let lastDash = rest.range(of: "-", options: .backwards) {
                let taskId = String(rest[rest.startIndex..<lastDash.lowerBound])
                let regionId = GeofencePlugin.taskLocPrefix + taskId
                for region in locationManager.monitoredRegions where region.identifier == regionId {
                    locationManager.stopMonitoring(for: region)
                }
            }
        }
        completionHandler([.banner, .sound, .list])
    }

    public func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        if response.notification.request.content.userInfo["openShop"] as? Bool == true {
            UserDefaults.standard.set(true, forKey: "pendingOpenShopList")
        }
        if response.notification.request.content.userInfo["openLater"] as? Bool == true {
            UserDefaults.standard.set(true, forKey: "pendingOpenLaterList")
        }
        completionHandler()
    }
}

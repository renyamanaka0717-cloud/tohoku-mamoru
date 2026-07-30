// Xcodeで ios/App/App/ に追加するファイル（Target: App）
// WKWebView は window.Notification（Web Notifications API）を実装していないため、
// アプリ内の通知はすべてこのプラグイン経由で UNUserNotificationCenter に直接出す。
import Capacitor
import UserNotifications

private struct ScheduledAlert: Codable { let id: String; let title: String; let body: String; let timestamp: Double }

@objc(LocalNotifyPlugin)
public class LocalNotifyPlugin: CAPPlugin {
    static let taskAlertPrefix = "task-alert-"
    static let freeSlotAlertPrefix = "free-slot-"
    static let shopNotifPrefix = "shop-notif-"
    static let laterStalePrefix = "later-stale-"
    static let wakeCheckinPrefix = "wake-checkin-"
    // 「通知を有効にする」ボタンなど、実際の通知内容が無いタイミングでも
    // その場で許可ダイアログを出すためのメソッド（notify()内のリクエストは通知発火時まで待たされる）
    @objc func requestPermission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
            call.resolve()
        }
    }

    @objc func notify(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? ""
        let body = call.getString("body") ?? ""
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { call.resolve(); return }
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default
            let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
            UNUserNotificationCenter.current().add(request)
            call.resolve()
        }
    }

    // タスクのアラート（開始時・何分前など）をまとめてネイティブに予約する。
    // GeofencePlugin.setGeofences と同じく、呼ばれるたびに既存の task-alert- 予約を
    // 全解除してから渡された内容で登録し直す（差分更新はしない）。
    @objc func syncTaskAlerts(_ call: CAPPluginCall) {
        scheduleAlerts(prefix: LocalNotifyPlugin.taskAlertPrefix, call: call)
    }

    // 空き時間ができたことの通知をまとめてネイティブに予約する（syncTaskAlertsと同じ全解除→再登録方式）。
    @objc func syncFreeSlotAlerts(_ call: CAPPluginCall) {
        scheduleAlerts(prefix: LocalNotifyPlugin.freeSlotAlertPrefix, call: call)
    }

    // 買い物リストの時間指定通知をまとめてネイティブに予約する（syncTaskAlertsと同じ全解除→再登録方式）。
    @objc func syncShopNotifs(_ call: CAPPluginCall) {
        scheduleAlerts(prefix: LocalNotifyPlugin.shopNotifPrefix, call: call)
    }

    // 「あとでやる」放置タスクの通知をまとめてネイティブに予約する（syncTaskAlertsと同じ全解除→再登録方式）。
    @objc func syncLaterStaleAlerts(_ call: CAPPluginCall) {
        scheduleAlerts(prefix: LocalNotifyPlugin.laterStalePrefix, call: call)
    }

    // 起床時チェックイン通知をまとめてネイティブに予約する（syncTaskAlertsと同じ全解除→再登録方式）。
    @objc func syncWakeCheckins(_ call: CAPPluginCall) {
        scheduleAlerts(prefix: LocalNotifyPlugin.wakeCheckinPrefix, call: call)
    }

    private func scheduleAlerts(prefix: String, call: CAPPluginCall) {
        let json = call.getString("alertsJson") ?? "[]"
        guard let data = json.data(using: .utf8),
              let alerts = try? JSONDecoder().decode([ScheduledAlert].self, from: data) else {
            call.reject("invalid alertsJson")
            return
        }
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { requests in
            let staleIds = requests.map { $0.identifier }.filter { $0.hasPrefix(prefix) }
            center.removePendingNotificationRequests(withIdentifiers: staleIds)
            guard !alerts.isEmpty else { call.resolve(); return }
            center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                guard granted else { call.resolve(); return }
                for alert in alerts {
                    let content = UNMutableNotificationContent()
                    content.title = alert.title
                    content.body = alert.body
                    content.sound = .default
                    let fireDate = Date(timeIntervalSince1970: alert.timestamp)
                    let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: fireDate)
                    let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
                    let request = UNNotificationRequest(identifier: alert.id, content: content, trigger: trigger)
                    center.add(request)
                }
                call.resolve()
            }
        }
    }
}

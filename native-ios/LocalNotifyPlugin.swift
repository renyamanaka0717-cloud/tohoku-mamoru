// Xcodeで ios/App/App/ に追加するファイル（Target: App）
// WKWebView は window.Notification（Web Notifications API）を実装していないため、
// アプリ内の通知はすべてこのプラグイン経由で UNUserNotificationCenter に直接出す。
import Capacitor
import UserNotifications

@objc(LocalNotifyPlugin)
public class LocalNotifyPlugin: CAPPlugin {
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
}

// Xcodeで ios/App/App/ に追加するファイル（Target: App）
import Capacitor
import UserNotifications

@objc(InactivityPlugin)
public class InactivityPlugin: CAPPlugin {
    static let identifier = "app-inactivity-reminder"

    @objc func scheduleReminder(_ call: CAPPluginCall) {
        let hours = call.getDouble("hours") ?? 0
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [InactivityPlugin.identifier])
        guard hours > 0 else { call.resolve(); return }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
            let content = UNMutableNotificationContent()
            content.title = "しばらく開いていません"
            content.body = "今日のタスクを確認しましょう"
            content.sound = .default
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: hours * 3600, repeats: false)
            let request = UNNotificationRequest(identifier: InactivityPlugin.identifier, content: content, trigger: trigger)
            UNUserNotificationCenter.current().add(request)
            call.resolve()
        }
    }

    @objc func cancelReminder(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [InactivityPlugin.identifier])
        call.resolve()
    }
}

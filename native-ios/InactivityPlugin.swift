// Xcodeで ios/App/App/ に追加するファイル（Target: App）
import Capacitor
import UserNotifications

@objc(InactivityPlugin)
public class InactivityPlugin: CAPPlugin {
    static let prefix = "app-inactivity-reminder-"

    // hoursListの各要素ごとに1件ずつ通知を予約する（最初の通知＋アプリが開かれなければ続く再通知ぶん）。
    // 呼ばれるたびに既存の予約を全解除してから登録し直す（差分更新はしない）
    @objc func scheduleReminder(_ call: CAPPluginCall) {
        let hoursList = call.getArray("hoursList", Double.self) ?? []
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { requests in
            let staleIds = requests.map { $0.identifier }.filter { $0.hasPrefix(InactivityPlugin.prefix) }
            center.removePendingNotificationRequests(withIdentifiers: staleIds)
            guard !hoursList.isEmpty else { call.resolve(); return }
            // LocalNotifyPluginと同じ理由でrequestAuthorizationは使わない：バックグラウンド
            // 移行のたびに走るこの事前予約が、オンボーディングの通知プロンプトより前に勝手に
            // システムの許可ダイアログを出してしまうため、既に許可済みの場合のみ予約する
            center.getNotificationSettings { settings in
                guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else {
                    call.resolve(); return
                }
                for (index, hours) in hoursList.enumerated() where hours > 0 {
                    let content = UNMutableNotificationContent()
                    content.title = "しばらく開いていません"
                    content.body = "今日のタスクを確認しましょう"
                    content.sound = .default
                    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: hours * 3600, repeats: false)
                    let request = UNNotificationRequest(identifier: "\(InactivityPlugin.prefix)\(index)", content: content, trigger: trigger)
                    center.add(request)
                }
                call.resolve()
            }
        }
    }

    @objc func cancelReminder(_ call: CAPPluginCall) {
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { requests in
            let staleIds = requests.map { $0.identifier }.filter { $0.hasPrefix(InactivityPlugin.prefix) }
            center.removePendingNotificationRequests(withIdentifiers: staleIds)
            call.resolve()
        }
    }
}

// Xcodeで ios/App/App/ に追加するファイル（Target: App）
import Capacitor
import WidgetKit

@objc(WidgetDataPlugin)
public class WidgetDataPlugin: CAPPlugin {
    // Widget Extension ターゲットにも同じApp Groupを追加すること
    static let appGroupId = "group.jp.brainbox.app"

    @objc func updateWidgetData(_ call: CAPPluginCall) {
        let tasksJson = call.getString("tasksJson") ?? "[]"
        let shopJson = call.getString("shopJson") ?? "[]"
        let laterJson = call.getString("laterJson") ?? "[]"
        let themeColor = call.getString("themeColor") ?? "#D9A3B2"
        // ウィジェット自体の表示には使わない（String Catalogでデバイス言語に自動追従するため）が、
        // GeofencePluginが場所通知・忘れ物防止アラートの本文を組み立てる時にアプリの言語設定と
        // 一致させるために保存しておく
        let language = call.getString("language") ?? "ja"
        guard let defaults = UserDefaults(suiteName: WidgetDataPlugin.appGroupId) else {
            call.reject("App Group not configured")
            return
        }
        defaults.set(tasksJson, forKey: "widgetTasksJson")
        defaults.set(shopJson, forKey: "widgetShopJson")
        defaults.set(laterJson, forKey: "widgetLaterJson")
        defaults.set(themeColor, forKey: "widgetThemeColor")
        defaults.set(language, forKey: "appLanguage")
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    @objc func getPendingWidgetActions(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: WidgetDataPlugin.appGroupId) else {
            call.resolve(["completedTaskIds": "[]", "purchasedShopItemIds": "[]"])
            return
        }
        let completedTaskIds = defaults.string(forKey: "pendingCompletedTaskIds") ?? "[]"
        let purchasedShopItemIds = defaults.string(forKey: "pendingPurchasedShopItemIds") ?? "[]"
        defaults.removeObject(forKey: "pendingCompletedTaskIds")
        defaults.removeObject(forKey: "pendingPurchasedShopItemIds")
        call.resolve(["completedTaskIds": completedTaskIds, "purchasedShopItemIds": purchasedShopItemIds])
    }
}

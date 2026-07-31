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
        guard let defaults = UserDefaults(suiteName: WidgetDataPlugin.appGroupId) else {
            call.reject("App Group not configured")
            return
        }
        defaults.set(tasksJson, forKey: "widgetTasksJson")
        defaults.set(shopJson, forKey: "widgetShopJson")
        defaults.set(laterJson, forKey: "widgetLaterJson")
        defaults.set(themeColor, forKey: "widgetThemeColor")
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    @objc func getPendingWidgetActions(_ call: CAPPluginCall) {
        guard let defaults = UserDefaults(suiteName: WidgetDataPlugin.appGroupId) else {
            call.resolve(["completedTaskIds": "[]", "purchasedShopItemIds": "[]", "openAddLater": false])
            return
        }
        let completedTaskIds = defaults.string(forKey: "pendingCompletedTaskIds") ?? "[]"
        let purchasedShopItemIds = defaults.string(forKey: "pendingPurchasedShopItemIds") ?? "[]"
        let openAddLater = defaults.bool(forKey: "pendingOpenAddLater")
        defaults.removeObject(forKey: "pendingCompletedTaskIds")
        defaults.removeObject(forKey: "pendingPurchasedShopItemIds")
        defaults.removeObject(forKey: "pendingOpenAddLater")
        call.resolve(["completedTaskIds": completedTaskIds, "purchasedShopItemIds": purchasedShopItemIds, "openAddLater": openAddLater])
    }
}

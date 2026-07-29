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
        let themeColor = call.getString("themeColor") ?? "#D9A3B2"
        guard let defaults = UserDefaults(suiteName: WidgetDataPlugin.appGroupId) else {
            call.reject("App Group not configured")
            return
        }
        defaults.set(tasksJson, forKey: "widgetTasksJson")
        defaults.set(shopJson, forKey: "widgetShopJson")
        defaults.set(themeColor, forKey: "widgetThemeColor")
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }
}

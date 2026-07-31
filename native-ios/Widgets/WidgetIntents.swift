// Xcodeで新規作成する「Widget Extension」ターゲットに追加するファイル
// （メインの App ターゲットではなく、Widget Extension ターゲットの Target Membership にすること）
// ウィジェット上のチェックタップを処理する（iOS 17+ のインタラクティブウィジェット機能）
import AppIntents
import WidgetKit

private let widgetIntentsAppGroupId = "group.jp.brainbox.app"

enum WidgetPendingActions {
    static func addCompletedTask(_ id: String) {
        appendId(id, key: "pendingCompletedTaskIds")
    }
    static func addPurchasedShopItem(_ id: String) {
        appendId(id, key: "pendingPurchasedShopItemIds")
    }
    private static func appendId(_ id: String, key: String) {
        guard let defaults = UserDefaults(suiteName: widgetIntentsAppGroupId) else { return }
        var ids: [String] = []
        if let json = defaults.string(forKey: key),
           let data = json.data(using: .utf8),
           let decoded = try? JSONDecoder().decode([String].self, from: data) {
            ids = decoded
        }
        if !ids.contains(id) { ids.append(id) }
        if let data = try? JSONEncoder().encode(ids), let json = String(data: data, encoding: .utf8) {
            defaults.set(json, forKey: key)
        }
    }
}

@available(iOS 17.0, *)
struct CompleteTaskIntent: AppIntent {
    static var title: LocalizedStringResource = "タスクを完了"
    @Parameter(title: "id") var id: String

    init() {}
    init(id: String) { self.id = id }

    func perform() async throws -> some IntentResult {
        WidgetPendingActions.addCompletedTask(id)
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

@available(iOS 17.0, *)
struct PurchaseShopItemIntent: AppIntent {
    static var title: LocalizedStringResource = "買い物を完了"
    @Parameter(title: "id") var id: String

    init() {}
    init(id: String) { self.id = id }

    func perform() async throws -> some IntentResult {
        WidgetPendingActions.addPurchasedShopItem(id)
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

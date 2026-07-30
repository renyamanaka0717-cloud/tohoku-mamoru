// Xcodeで新規作成する「Widget Extension」ターゲットに追加するファイル
// （メインの App ターゲットではなく、Widget Extension ターゲットの Target Membership にすること）
import WidgetKit
import SwiftUI
import AppIntents

private let appGroupId = "group.jp.brainbox.app"
private let defaultThemeColor = Color(red: 217/255, green: 163/255, blue: 178/255)

struct WidgetTaskItem: Codable { let id: String; let name: String; let time: String }
struct WidgetShopItem: Codable { let id: String; let name: String }

extension Color {
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        s.removeAll { $0 == "#" }
        var rgb: UInt64 = 0
        Scanner(string: s).scanHexInt64(&rgb)
        let r = Double((rgb >> 16) & 0xFF) / 255
        let g = Double((rgb >> 8) & 0xFF) / 255
        let b = Double(rgb & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}

private func loadPendingIds(_ key: String) -> Set<String> {
    guard let defaults = UserDefaults(suiteName: appGroupId),
          let json = defaults.string(forKey: key),
          let data = json.data(using: .utf8),
          let ids = try? JSONDecoder().decode([String].self, from: data) else { return [] }
    return Set(ids)
}

private func loadTasks() -> [WidgetTaskItem] {
    guard let defaults = UserDefaults(suiteName: appGroupId),
          let json = defaults.string(forKey: "widgetTasksJson"),
          let data = json.data(using: .utf8),
          let items = try? JSONDecoder().decode([WidgetTaskItem].self, from: data) else { return [] }
    let pending = loadPendingIds("pendingCompletedTaskIds")
    return items.filter { !pending.contains($0.id) }
}

private func loadShopItems() -> [WidgetShopItem] {
    guard let defaults = UserDefaults(suiteName: appGroupId),
          let json = defaults.string(forKey: "widgetShopJson"),
          let data = json.data(using: .utf8),
          let items = try? JSONDecoder().decode([WidgetShopItem].self, from: data) else { return [] }
    let pending = loadPendingIds("pendingPurchasedShopItemIds")
    return items.filter { !pending.contains($0.id) }
}

private func loadThemeColor() -> Color {
    guard let defaults = UserDefaults(suiteName: appGroupId),
          let hex = defaults.string(forKey: "widgetThemeColor") else { return defaultThemeColor }
    return Color(hex: hex)
}

// MARK: - 次の予定 & 買い物リスト（2カラム統合ウィジェット）

struct CombinedEntry: TimelineEntry {
    let date: Date
    let tasks: [WidgetTaskItem]
    let shopItems: [WidgetShopItem]
    let themeColor: Color
}

struct CombinedProvider: TimelineProvider {
    func placeholder(in context: Context) -> CombinedEntry {
        CombinedEntry(
            date: Date(),
            tasks: [WidgetTaskItem(id: "1", name: "予定を確認", time: "--:--")],
            shopItems: [WidgetShopItem(id: "1", name: "買い物リスト")],
            themeColor: defaultThemeColor
        )
    }
    func getSnapshot(in context: Context, completion: @escaping (CombinedEntry) -> Void) {
        completion(CombinedEntry(date: Date(), tasks: loadTasks(), shopItems: loadShopItems(), themeColor: loadThemeColor()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<CombinedEntry>) -> Void) {
        let entry = CombinedEntry(date: Date(), tasks: loadTasks(), shopItems: loadShopItems(), themeColor: loadThemeColor())
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(15 * 60))))
    }
}

struct CombinedWidgetView: View {
    var entry: CombinedEntry

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Text("次の予定").font(.caption).foregroundColor(.secondary)
                if entry.tasks.isEmpty {
                    Text("予定はありません").font(.footnote).foregroundColor(.secondary)
                } else {
                    ForEach(entry.tasks.prefix(4), id: \.id) { task in
                        if #available(iOS 17.0, *) {
                            Button(intent: CompleteTaskIntent(id: task.id)) {
                                taskRow(task)
                            }
                            .buttonStyle(.plain)
                        } else {
                            taskRow(task)
                        }
                    }
                }
                Spacer()
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Divider()

            VStack(alignment: .leading, spacing: 8) {
                Text("買い物リスト").font(.caption).foregroundColor(.secondary)
                if entry.shopItems.isEmpty {
                    Text("買うものはありません").font(.footnote).foregroundColor(.secondary)
                } else {
                    ForEach(entry.shopItems.prefix(6), id: \.id) { item in
                        if #available(iOS 17.0, *) {
                            Button(intent: PurchaseShopItemIntent(id: item.id)) {
                                shopRow(item)
                            }
                            .buttonStyle(.plain)
                        } else {
                            shopRow(item)
                        }
                    }
                }
                Spacer()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding()
        .containerBackground(.background, for: .widget)
    }

    private func taskRow(_ task: WidgetTaskItem) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "circle").font(.footnote).foregroundStyle(entry.themeColor)
            VStack(alignment: .leading, spacing: 1) {
                Text(task.time).font(.caption2).bold().foregroundStyle(entry.themeColor)
                Text(task.name).font(.footnote).lineLimit(1)
            }
        }
    }

    private func shopRow(_ item: WidgetShopItem) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "circle").font(.footnote).foregroundStyle(entry.themeColor)
            Text(item.name).font(.footnote).lineLimit(1)
        }
    }
}

struct CombinedWidget: Widget {
    let kind: String = "BrainBoxCombinedWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CombinedProvider()) { entry in
            CombinedWidgetView(entry: entry)
        }
        .configurationDisplayName("次の予定 & 買い物リスト")
        .description("今日の予定と買い物リストをまとめて表示します。タップで完了にできます。")
        .supportedFamilies([.systemLarge])
    }
}

@main
struct BrainBoxWidgetBundle: WidgetBundle {
    var body: some Widget {
        CombinedWidget()
    }
}

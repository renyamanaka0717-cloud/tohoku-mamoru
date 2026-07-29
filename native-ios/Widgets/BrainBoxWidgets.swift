// Xcodeで新規作成する「Widget Extension」ターゲットに追加するファイル
// （メインの App ターゲットではなく、Widget Extension ターゲットの Target Membership にすること）
import WidgetKit
import SwiftUI

private let appGroupId = "group.jp.brainbox.app"
private let accentColor = Color(red: 217/255, green: 163/255, blue: 178/255)

struct WidgetTaskItem: Codable { let name: String; let time: String }
struct WidgetShopItem: Codable { let name: String }

private func loadTasks() -> [WidgetTaskItem] {
    guard let defaults = UserDefaults(suiteName: appGroupId),
          let json = defaults.string(forKey: "widgetTasksJson"),
          let data = json.data(using: .utf8),
          let items = try? JSONDecoder().decode([WidgetTaskItem].self, from: data) else { return [] }
    return items
}

private func loadShopItems() -> [WidgetShopItem] {
    guard let defaults = UserDefaults(suiteName: appGroupId),
          let json = defaults.string(forKey: "widgetShopJson"),
          let data = json.data(using: .utf8),
          let items = try? JSONDecoder().decode([WidgetShopItem].self, from: data) else { return [] }
    return items
}

// MARK: - 次の予定 ウィジェット

struct NextTaskEntry: TimelineEntry {
    let date: Date
    let tasks: [WidgetTaskItem]
}

struct NextTaskProvider: TimelineProvider {
    func placeholder(in context: Context) -> NextTaskEntry {
        NextTaskEntry(date: Date(), tasks: [WidgetTaskItem(name: "予定を確認", time: "--:--")])
    }
    func getSnapshot(in context: Context, completion: @escaping (NextTaskEntry) -> Void) {
        completion(NextTaskEntry(date: Date(), tasks: loadTasks()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<NextTaskEntry>) -> Void) {
        let entry = NextTaskEntry(date: Date(), tasks: loadTasks())
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(15 * 60))))
    }
}

struct NextTaskWidgetView: View {
    var entry: NextTaskEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("次の予定").font(.caption).foregroundColor(.secondary)
            if entry.tasks.isEmpty {
                Spacer()
                Text("今日の予定はありません").font(.footnote).foregroundColor(.secondary)
                Spacer()
            } else {
                ForEach(entry.tasks.prefix(3), id: \.name) { task in
                    HStack(spacing: 6) {
                        Text(task.time).font(.caption).bold().foregroundStyle(accentColor)
                        Text(task.name).font(.footnote).lineLimit(1)
                    }
                }
                Spacer()
            }
        }
        .padding()
        .containerBackground(.background, for: .widget)
    }
}

struct NextTaskWidget: Widget {
    let kind: String = "NextTaskWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: NextTaskProvider()) { entry in
            NextTaskWidgetView(entry: entry)
        }
        .configurationDisplayName("次の予定")
        .description("今日のこれからの予定を表示します。")
        .supportedFamilies([.systemMedium])
    }
}

// MARK: - 買い物リスト ウィジェット

struct ShopListEntry: TimelineEntry {
    let date: Date
    let items: [WidgetShopItem]
}

struct ShopListProvider: TimelineProvider {
    func placeholder(in context: Context) -> ShopListEntry {
        ShopListEntry(date: Date(), items: [WidgetShopItem(name: "買い物リスト")])
    }
    func getSnapshot(in context: Context, completion: @escaping (ShopListEntry) -> Void) {
        completion(ShopListEntry(date: Date(), items: loadShopItems()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<ShopListEntry>) -> Void) {
        let entry = ShopListEntry(date: Date(), items: loadShopItems())
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(15 * 60))))
    }
}

struct ShopListWidgetView: View {
    var entry: ShopListEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("買い物リスト").font(.caption).foregroundColor(.secondary)
            if entry.items.isEmpty {
                Spacer()
                Text("買うものはありません").font(.footnote).foregroundColor(.secondary)
                Spacer()
            } else {
                ForEach(entry.items.prefix(5), id: \.name) { item in
                    Text("・\(item.name)").font(.footnote).lineLimit(1)
                }
                Spacer()
            }
        }
        .padding()
        .containerBackground(.background, for: .widget)
    }
}

struct ShopListWidget: Widget {
    let kind: String = "ShopListWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ShopListProvider()) { entry in
            ShopListWidgetView(entry: entry)
        }
        .configurationDisplayName("買い物リスト")
        .description("未購入の買い物リストを表示します。")
        .supportedFamilies([.systemMedium])
    }
}

@main
struct BrainBoxWidgetBundle: WidgetBundle {
    var body: some Widget {
        NextTaskWidget()
        ShopListWidget()
    }
}

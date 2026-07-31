// Xcodeで新規作成する「Widget Extension」ターゲットに追加するファイル
// （メインの App ターゲットではなく、Widget Extension ターゲットの Target Membership にすること）
import WidgetKit
import SwiftUI
import AppIntents

private let appGroupId = "group.jp.brainbox.app"
private let defaultThemeColor = Color(red: 217/255, green: 163/255, blue: 178/255)
// 昼は白の半透明、夜（ダークモード）は黒の半透明に自動で切り替わる背景
private let adaptiveWidgetBackground = Color(.systemBackground).opacity(0.85)

struct WidgetTaskItem: Codable { let id: String; let name: String; let time: String; let icon: String }
struct WidgetShopItem: Codable { let id: String; let name: String }
struct WidgetLaterItem: Codable { let id: String; let name: String; let icon: String }

// アプリ本体（Icons.tsx の AppIcons、Phosphor Icons）のアイコンキーを
// ウィジェットで使えるSF Symbolsにマッピングする（近いものが無ければ note.text にフォールバック）
private func sfSymbol(for iconKey: String) -> String {
    let m: [String: String] = [
        "task": "note.text", "shopping": "cart", "food": "fork.knife",
        "clean": "sparkles", "work": "briefcase", "travel": "car",
        "rest": "cup.and.saucer", "sleep": "moon.zzz", "calendar": "calendar",
        "question": "questionmark.circle", "music": "music.note", "book": "book",
        "exercise": "figure.strengthtraining.traditional", "health": "heart", "phone": "phone",
        "home": "house", "study": "graduationcap", "money": "yensign.circle",
        "game": "gamecontroller", "camera": "camera",
        "washing": "washer", "cooking": "flame", "paw": "pawprint",
        "medicine": "pills", "hospital": "cross.case", "payment": "creditcard",
        "document": "doc.text", "mail": "envelope", "meeting": "person.2",
        "train": "tram", "gift": "gift", "scissors": "scissors",
        "running": "figure.run", "yoga": "figure.mind.and.body", "bicycle": "bicycle",
        "guitar": "guitars", "basketball": "basketball", "soccer": "soccerball",
        "volleyball": "sportscourt", "paint": "paintbrush", "rocket": "paperplane.fill",
        "cat": "cat", "dog": "dog", "bird": "bird", "fish": "fish",
        "rabbit": "hare", "flower": "leaf", "tree": "tree", "sun": "sun.max",
        "airplane": "airplane", "bus": "bus", "boat": "sailboat",
        "backpack": "backpack", "suitcase": "suitcase", "location": "mappin.and.ellipse",
        "tent": "tent", "campfire": "flame.fill", "cake": "birthday.cake", "pizza": "fork.knife.circle",
        "bathtub": "bathtub", "bed": "bed.double", "creditcard": "creditcard", "piggybank": "banknote",
    ]
    return m[iconKey] ?? "note.text"
}

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

private func loadLaterTasks() -> [WidgetLaterItem] {
    guard let defaults = UserDefaults(suiteName: appGroupId),
          let json = defaults.string(forKey: "widgetLaterJson"),
          let data = json.data(using: .utf8),
          let items = try? JSONDecoder().decode([WidgetLaterItem].self, from: data) else { return [] }
    let pending = loadPendingIds("pendingCompletedTaskIds")
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
    let laterItems: [WidgetLaterItem]
    let themeColor: Color
}

struct CombinedProvider: TimelineProvider {
    func placeholder(in context: Context) -> CombinedEntry {
        CombinedEntry(
            date: Date(),
            tasks: [WidgetTaskItem(id: "1", name: "予定を確認", time: "--:--", icon: "task")],
            shopItems: [WidgetShopItem(id: "1", name: "買い物リスト")],
            laterItems: [WidgetLaterItem(id: "1", name: "あとでやる", icon: "task")],
            themeColor: defaultThemeColor
        )
    }
    func getSnapshot(in context: Context, completion: @escaping (CombinedEntry) -> Void) {
        completion(CombinedEntry(date: Date(), tasks: loadTasks(), shopItems: loadShopItems(), laterItems: loadLaterTasks(), themeColor: loadThemeColor()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<CombinedEntry>) -> Void) {
        let entry = CombinedEntry(date: Date(), tasks: loadTasks(), shopItems: loadShopItems(), laterItems: loadLaterTasks(), themeColor: loadThemeColor())
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
                    let visibleTasks = Array(entry.tasks.prefix(4))
                    ForEach(Array(visibleTasks.enumerated()), id: \.element.id) { index, task in
                        if #available(iOS 17.0, *) {
                            Button(intent: CompleteTaskIntent(id: task.id)) {
                                taskRow(task, isLast: index == visibleTasks.count - 1)
                            }
                            .buttonStyle(.plain)
                        } else {
                            taskRow(task, isLast: index == visibleTasks.count - 1)
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
        .containerBackground(adaptiveWidgetBackground, for: .widget)
    }

    private func taskRow(_ task: WidgetTaskItem, isLast: Bool) -> some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(spacing: 0) {
                ZStack {
                    Circle().fill(entry.themeColor.opacity(0.18)).frame(width: 26, height: 26)
                    Image(systemName: sfSymbol(for: task.icon)).font(.system(size: 12)).foregroundStyle(entry.themeColor)
                }
                if !isLast {
                    Rectangle().fill(Color(.systemGray4)).frame(width: 2).frame(maxHeight: .infinity)
                }
            }
            VStack(alignment: .leading, spacing: 1) {
                Text(task.time).font(.caption2).bold().foregroundStyle(entry.themeColor)
                Text(task.name).font(.footnote).lineLimit(1)
            }
            .padding(.top, 3)
            Spacer(minLength: 4)
            Image(systemName: "circle").font(.footnote).foregroundStyle(.secondary)
                .padding(.top, 5)
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

// MARK: - 4分割ウィジェット（次の予定・買い物リスト・あとでやる・追加ボタン）

struct QuadWidgetView: View {
    var entry: CombinedEntry

    var body: some View {
        VStack(spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                quadColumn(title: "次の予定") {
                    if entry.tasks.isEmpty {
                        Text("予定はありません").font(.caption2).foregroundColor(.secondary)
                    } else {
                        ForEach(entry.tasks.prefix(6), id: \.id) { task in
                            if #available(iOS 17.0, *) {
                                Button(intent: CompleteTaskIntent(id: task.id)) { miniTaskRow(task) }.buttonStyle(.plain)
                            } else {
                                miniTaskRow(task)
                            }
                        }
                    }
                }
                Divider()
                quadColumn(title: "買い物リスト") {
                    if entry.shopItems.isEmpty {
                        Text("買うものはありません").font(.caption2).foregroundColor(.secondary)
                    } else {
                        ForEach(entry.shopItems.prefix(10), id: \.id) { item in
                            if #available(iOS 17.0, *) {
                                Button(intent: PurchaseShopItemIntent(id: item.id)) { miniShopRow(item) }.buttonStyle(.plain)
                            } else {
                                miniShopRow(item)
                            }
                        }
                    }
                }
            }
            Divider()
            HStack(alignment: .top, spacing: 10) {
                quadColumn(title: "あとでやる") {
                    if entry.laterItems.isEmpty {
                        Text("ありません").font(.caption2).foregroundColor(.secondary)
                    } else {
                        ForEach(entry.laterItems.prefix(7), id: \.id) { item in
                            if #available(iOS 17.0, *) {
                                Button(intent: CompleteTaskIntent(id: item.id)) { miniLaterRow(item) }.buttonStyle(.plain)
                            } else {
                                miniLaterRow(item)
                            }
                        }
                    }
                }
                Divider()
                VStack {
                    Spacer(minLength: 0)
                    Link(destination: URL(string: "brainbox://addLater")!) {
                        VStack(spacing: 4) {
                            ZStack {
                                Circle().fill(entry.themeColor.opacity(0.18)).frame(width: 40, height: 40)
                                Image(systemName: "plus").font(.system(size: 16, weight: .bold)).foregroundStyle(entry.themeColor)
                            }
                            Text("あとでやるタスクを追加").font(.caption2).foregroundColor(.secondary).multilineTextAlignment(.center)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .padding()
        .containerBackground(adaptiveWidgetBackground, for: .widget)
    }

    private func quadColumn<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.caption2).foregroundColor(.secondary)
            content()
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func miniTaskRow(_ task: WidgetTaskItem) -> some View {
        HStack(spacing: 5) {
            Image(systemName: sfSymbol(for: task.icon)).font(.system(size: 10)).foregroundStyle(entry.themeColor)
            VStack(alignment: .leading, spacing: 0) {
                Text(task.time).font(.system(size: 9)).bold().foregroundStyle(entry.themeColor)
                Text(task.name).font(.caption2).lineLimit(1)
            }
        }
    }

    private func miniShopRow(_ item: WidgetShopItem) -> some View {
        HStack(spacing: 5) {
            Image(systemName: "circle").font(.system(size: 9)).foregroundStyle(entry.themeColor)
            Text(item.name).font(.caption2).lineLimit(1)
        }
    }

    private func miniLaterRow(_ item: WidgetLaterItem) -> some View {
        HStack(spacing: 5) {
            Image(systemName: sfSymbol(for: item.icon)).font(.system(size: 10)).foregroundStyle(entry.themeColor)
            Text(item.name).font(.caption2).lineLimit(1)
        }
    }
}

struct QuadWidget: Widget {
    let kind: String = "BrainBoxQuadWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CombinedProvider()) { entry in
            QuadWidgetView(entry: entry)
        }
        .configurationDisplayName("4分割（予定・買い物・あとでやる・追加）")
        .description("次の予定・買い物リスト・あとでやるタスクを4分割で表示し、＋タップで新規タスクを追加できます。")
        .supportedFamilies([.systemLarge])
    }
}

// MARK: - あとでやる追加ウィジェット（systemLargeの半分の面積・ワンタップで追加画面を開く）

struct AddLaterWidgetView: View {
    var entry: CombinedEntry

    var body: some View {
        Link(destination: URL(string: "brainbox://addLater")!) { content }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .containerBackground(adaptiveWidgetBackground, for: .widget)
    }

    private var content: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle().fill(entry.themeColor.opacity(0.18)).frame(width: 52, height: 52)
                Image(systemName: "plus").font(.system(size: 22, weight: .bold)).foregroundStyle(entry.themeColor)
            }
            Text("あとでやるを追加").font(.footnote).bold().foregroundStyle(.primary)
        }
    }
}

struct AddLaterWidget: Widget {
    let kind: String = "BrainBoxAddLaterWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CombinedProvider()) { entry in
            AddLaterWidgetView(entry: entry)
        }
        .configurationDisplayName("あとでやるを追加")
        .description("タップするだけで「あとでやる」タスクの追加画面を開けます。")
        .supportedFamilies([.systemSmall])
    }
}

@main
struct BrainBoxWidgetBundle: WidgetBundle {
    var body: some Widget {
        CombinedWidget()
        QuadWidget()
        AddLaterWidget()
    }
}

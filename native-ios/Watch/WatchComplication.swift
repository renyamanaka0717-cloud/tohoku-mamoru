// Xcodeで新規作成する「Widget Extension」ターゲットに追加するファイル
// （iPhone側の`native-ios/Widgets/BrainBoxWidgets.swift`とは別物。こちらは
// 「BrainBox Watch App」に埋め込む専用のWidget Extensionターゲットに追加すること。
// Apple Watchの文字盤コンプリケーションは、Watch App自身に埋め込まれた専用の
// Widget Extensionでしか提供できず、iPhone側のWidget Extensionを共有・流用する
// ことはできない）
//
// タップするとBrainBox Watch Appが起動し、ContentView.swiftの0.4秒遅延自動開始
// ロジックによりそのままダイクテーションが始まる。WidgetKitのwidgetはLink/URLを
// 明示しなくてもタップで単純にアプリを起動する標準動作のため、deep link処理は
// 一切不要（ContentView側の既存の自動開始ロジックにそのまま乗る）
import WidgetKit
import SwiftUI

struct WatchComplicationEntry: TimelineEntry {
    let date: Date
}

struct WatchComplicationProvider: TimelineProvider {
    func placeholder(in context: Context) -> WatchComplicationEntry {
        WatchComplicationEntry(date: Date())
    }
    func getSnapshot(in context: Context, completion: @escaping (WatchComplicationEntry) -> Void) {
        completion(WatchComplicationEntry(date: Date()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WatchComplicationEntry>) -> Void) {
        // 常に同じ見た目（マイクアイコンのみ）のためタイムライン更新は不要
        completion(Timeline(entries: [WatchComplicationEntry(date: Date())], policy: .never))
    }
}

struct WatchComplicationView: View {
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .accessoryInline:
            Label("音声で追加", systemImage: "mic.fill")
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Image(systemName: "mic.fill")
                Text("音声で追加")
                    .font(.caption2)
            }
            .widgetAccentable()
        default:
            // .accessoryCircular・.accessoryCorner向け。文字盤の小さい円形スロットでは
            // アイコン1つだけがちょうどよいサイズになる
            Image(systemName: "mic.fill")
                .widgetAccentable()
        }
    }
}

struct WatchComplication: Widget {
    let kind: String = "BrainBoxVoiceComplication"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WatchComplicationProvider()) { _ in
            WatchComplicationView()
        }
        .configurationDisplayName("音声で追加")
        .description("タップするとすぐに音声入力が始まります。")
        .supportedFamilies([.accessoryCircular, .accessoryCorner, .accessoryRectangular, .accessoryInline])
    }
}

@main
struct WatchComplicationBundle: WidgetBundle {
    var body: some Widget {
        WatchComplication()
    }
}

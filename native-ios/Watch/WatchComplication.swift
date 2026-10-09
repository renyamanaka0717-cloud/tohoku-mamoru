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

    // ロゴ画像(PNG)ではなく"BB"の文字をそのまま使う。accessory系ファミリー（文字盤の
    // コンプリケーション・ロック画面ウィジェット共通）はシステムが強制的にモノクロ/
    // アクセントカラーでレンダリングする文字盤がほとんどで、複雑な形のロゴ画像は
    // 塗りつぶされてシルエットが判別できなくなる・transparent前提のテンプレート画像を
    // 別途用意する手間が発生する。Textはどの文字盤でも綴りが崩れず読めるため、
    // 新しい画像アセットを用意せずに済むこの方式にした
    var body: some View {
        switch family {
        case .accessoryInline:
            Label("BB", systemImage: "mic.fill")
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Text("BB")
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                Text("音声で追加")
                    .font(.caption2)
            }
            .widgetAccentable()
        default:
            // .accessoryCircular・.accessoryCorner向け。文字盤の小さい円形スロットでは
            // "BB"の2文字だけがちょうどよいサイズになる
            Text("BB")
                .font(.system(size: 20, weight: .bold, design: .rounded))
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

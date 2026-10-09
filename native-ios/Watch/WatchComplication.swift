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

    // "BB"のロゴマーク（アプリアイコンの文字部分だけを白シルエット・透明背景で切り出した
    // テンプレート画像、native-ios/icons/BBMark-Template.png）を使う。
    // 当初はTextで"BB"の2文字を描画していたが「文字っぽくて微妙、アイコンそのままがいい」
    // というフィードバックを受けて画像に変更した。
    // フルカラーのアプリアイコンPNG（背景色付きの正方形）をそのまま使わなかった理由:
    // accessory系ファミリー（文字盤コンプリケーション・ロック画面ウィジェット共通）は
    // システムが文字盤ごとに強制的にモノクロ/アクセントカラーでレンダリングすることが多く、
    // そのレンダリングは画像のアルファチャンネルだけを形状として使う。背景まで不透明な
    // フルカラーPNGをそのまま使うと、形が失われて単なる塗りつぶしの丸/四角になってしまう。
    // そのため「BB」の文字部分だけをアルファ抜きした透明背景のテンプレート画像を用意し、
    // .renderingMode(.template)で明示的にテンプレート扱いにすることで、どの文字盤でも
    // 実際のロゴの形のまま正しくモノクロ/アクセントカラー表示される
    private var mark: some View {
        Image("BBMark")
            .renderingMode(.template)
            .resizable()
            .aspectRatio(contentMode: .fit)
            .widgetAccentable()
    }

    var body: some View {
        switch family {
        case .accessoryRectangular:
            mark.frame(height: 20)
        case .accessoryInline:
            mark.frame(height: 12)
        default:
            // .accessoryCircular・.accessoryCorner向け
            mark.frame(height: 22).padding(3)
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

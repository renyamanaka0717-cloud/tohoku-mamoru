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
    @Environment(\.widgetRenderingMode) private var renderingMode

    // "BB"のロゴマーク（アプリアイコンの文字部分だけを白シルエット・透明背景で切り出した
    // テンプレート画像、native-ios/icons/BBMark-Template.png）を使う。
    //
    // 色について: widgetRenderingModeが.fullColorの文字盤（フルカラー表示に対応した
    // 一部の文字盤）では、アプリのデフォルトテーマカラー（THEMESの'mint'、#94CFC8）で
    // 固定表示する。一方、.accented/.vibrant（大半の文字盤はこちら。モノクロ/ユーザーが
    // その文字盤向けに選んだ単色でシステムが強制的に着色するモード）では、.widgetAccentable()
    // を付けてシステムに着色を委ねる——**ここでアプリ独自の色を指定することはできない**。
    // これはiPhoneのロック画面ウィジェットの節に書いた既知の制約と同じで、Appleの仕様上
    // 「その文字盤の配色に全コンプリケーションを統一させる」ための意図的な挙動のため、
    // アプリ側から強制的にmintへ固定する手段は無い（新しいセッションで「ミント固定に
    // できないか」という要望が来ても、.accented/.vibrantモードについては技術的に不可能
    // であることを説明すること。可能なのは.fullColorモードの文字盤限定）
    private var mark: some View {
        Group {
            if renderingMode == .fullColor {
                Image("BBMark")
                    .renderingMode(.template)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .foregroundStyle(Color(red: 148/255, green: 207/255, blue: 200/255))
            } else {
                Image("BBMark")
                    .renderingMode(.template)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .widgetAccentable()
            }
        }
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

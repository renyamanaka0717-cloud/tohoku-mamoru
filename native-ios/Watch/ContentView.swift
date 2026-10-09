// Xcodeで新規作成する「Watch App」ターゲットに追加するファイル（Target: BrainBox Watch App）
//
// UIは「マイクボタン」＋状態表示のみ。日時設定・所要時間設定は意図的に持たない
// （「思いついた瞬間に、とりあえず頭の外に出す」ことに特化させる方針）。
//
// 【実機検証で判明: .onAppear自動開始は撤回済み】当初はアプリを開いた瞬間（.onAppear）に
// マイクボタンのタップを待たずに自動でダイクテーションを開始する設計だったが、実機
// （watchOS 26.6）で確認したところ、この自動開始のタイミングでは
// WKExtension.shared().visibleInterfaceController がnilを返り、常にフォールバック
// （下記TextField）に落ちてしまう不具合が実際に発生した。さらにidle状態の描画とフォール
// バックのTextFieldが同時に出てしまい、「ボタンとテキスト欄が両方出ていて何をすればいいか
// 分からない」画面になっていた。原因は、WKHostingControllerがvisibleInterfaceControllerとして
// 解決されるまでにビュー階層の初期化が完了している保証がなく、.onAppear発火時点ではまだ
// 間に合っていないため（ユーザーが実際にボタンをタップする頃にはhostingControllerの
// アタッチが完了しており、手動タップ起点なら成功する）。そのため**自動開始はやめ、
// 必ずマイクボタンをタップしてから起動する設計に戻した**。idle画面は常にマイクボタンのみを
// 表示し、タップした結果visibleInterfaceControllerがまだnilだった場合にのみ、ボタンを
// フォールバックのTextFieldに差し替える（ボタンとTextFieldを同時に出さない）。
//
// 【音声入力の実装方法】watchOSにはiOS版VoiceInputPlugin（SFSpeechRecognizer＋AVAudioEngine自前実装）
// に相当する作り込みは不要。WatchKitのpresentTextInputController(withSuggestions:allowedInputMode:)を
// allowedInputMode: .plain で呼ぶと、システム標準の入力選択画面（ダイクテーション/Scribble/
// 定型リスト）が開き、ダイクテーションを選んで話し終えると自動でテキストに変換されてcompletionに返る
// （.forceDictationというケースは実在しない。WKTextInputModeは.plain/.allowEmoji/
// .allowAnimatedEmojiの3つのみで、候補チップ/Scribble選択を完全にスキップする手段は無い。
// SFSpeechRecognizer/Speechフレームワークを自前で使う案も検討したが、watchOS単体アプリでは
// そもそもSpeechフレームワーク自体が提供されておらず技術的に不可能と判明した実績がある）
// （音声キャプチャ・認識はシステムのプロセスが行うため、アプリ側でNSMicrophoneUsageDescription/
// NSSpeechRecognitionUsageDescriptionをWatch App側Info.plistに追加する必要は無い——iOS版の
// VoiceInputPluginが自前でマイクを掴む方式とはこの点が根本的に異なる）
import SwiftUI
import WatchKit

private enum FlowState: Equatable {
    case idle
    case dictating
    case preview(String)
    case sending
    case done
    case error
}

struct ContentView: View {
    @EnvironmentObject var connector: WatchConnector
    @State private var state: FlowState = .idle
    @State private var fallbackText: String = ""
    @State private var showFallbackField = false
    @FocusState private var fallbackFieldFocused: Bool

    // iPhone側（設定 → 表示設定 → テーマカラー）が選んでいる色にマイクアイコンを追従させる。
    // まだWatchConnectorが受信できていない場合（初回起動直後等）は、テーマカラーの既定値
    // （THEMESのid:'mint'、#94CFC8）にフォールバックする。#D9A3B2はタブ・FAB等に使う
    // 固定UIアクセントカラーで、テーマカラーの既定値とは別物なので混同しないこと
    private var accentColor: Color {
        Color(hex: connector.themeColorHex ?? "#94CFC8")
    }

    var body: some View {
        VStack(spacing: 10) {
            switch state {
            case .idle:
                // ボタンとフォールバックのTextFieldを同時に出さない（タップした結果
                // visibleInterfaceControllerがnilだった場合だけTextFieldに差し替える）
                if showFallbackField {
                    TextField("タスク名", text: $fallbackText, onCommit: {
                        submit(fallbackText)
                        fallbackText = ""
                        showFallbackField = false
                    })
                    .focused($fallbackFieldFocused)
                    .onAppear { fallbackFieldFocused = true }
                } else {
                    Button(action: startDictation) {
                        VStack(spacing: 6) {
                            Image(systemName: "mic.circle.fill")
                                .font(.system(size: 44))
                            Text("あとでやるに追加")
                                .font(.footnote)
                        }
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(accentColor)
                }
            case .dictating:
                ProgressView()
            case .preview(let text):
                Text(text)
                    .font(.footnote)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
            case .sending:
                ProgressView()
            case .done:
                VStack(spacing: 6) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 36))
                        .foregroundStyle(.green)
                    Text("追加しました")
                        .font(.footnote)
                }
            case .error:
                VStack(spacing: 6) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.system(size: 36))
                        .foregroundStyle(.red)
                    Text("送信できませんでした")
                        .font(.footnote)
                }
            }
        }
        .padding()
    }

    private func startDictation() {
        state = .dictating
        if let controller = WKExtension.shared().visibleInterfaceController {
            controller.presentTextInputController(withSuggestions: nil, allowedInputMode: .plain) { results in
                DispatchQueue.main.async {
                    if let text = (results?.first as? String), !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        showPreviewThenSend(text)
                    } else {
                        state = .idle
                    }
                }
            }
        } else {
            // 実機で visibleInterfaceController が取れなかった場合の最終手段
            state = .idle
            showFallbackField = true
        }
    }

    private func showPreviewThenSend(_ text: String) {
        state = .preview(text)
        // VoiceCapturePopup（iOS版ウィジェットの音声入力）と同じく、結果が見える間を少し持たせてから進める
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            submit(text)
        }
    }

    private func submit(_ text: String) {
        state = .sending
        let ok = connector.send(text)
        state = ok ? .done : .error
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) {
            state = .idle
        }
    }
}

// native-ios/Widgets/BrainBoxWidgets.swiftにある同名のextensionと同じ実装（Widget
// ExtensionとWatch Appは別ターゲットのためファイルを共有できず、こちらにも複製している）
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

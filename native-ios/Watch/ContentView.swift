// Xcodeで新規作成する「Watch App」ターゲットに追加するファイル（Target: BrainBox Watch App）
//
// UIは「マイクボタン」＋状態表示のみ。日時設定・所要時間設定は意図的に持たない
// （「思いついた瞬間に、とりあえず頭の外に出す」ことに特化させる方針）。
// アプリを開いた瞬間（.onAppear）に、マイクボタンのタップを待たずに自動でダイクテーションを
// 開始する。マイクボタン自体は、キャンセル・空発話等でidleに戻った時の手動リトライ用に残す。
//
// 【音声入力の実装方法】watchOSにはiOS版VoiceInputPlugin（SFSpeechRecognizer＋AVAudioEngine自前実装）
// に相当する作り込みは不要。WatchKitのpresentTextInputController(withSuggestions:allowedInputMode:)を
// allowedInputMode: .plain で呼ぶと、システム標準の入力選択画面（ダイクテーション/Scribble/
// 定型リスト）が開き、ダイクテーションを選んで話し終えると自動でテキストに変換されてcompletionに返る
// （.forceDictationというケースは実在しない。WKTextInputModeは.plain/.allowEmoji/
// .allowAnimatedEmojiの3つのみで、候補チップ/Scribble選択を完全にスキップする手段は無い）
// （音声キャプチャ・認識はシステムのプロセスが行うため、アプリ側でNSMicrophoneUsageDescription/
// NSSpeechRecognitionUsageDescriptionをWatch App側Info.plistに追加する必要は無い——iOS版の
// VoiceInputPluginが自前でマイクを掴む方式とはこの点が根本的に異なる）。
// SwiftUIのみのApp lifecycle（WKApplicationDelegateAdaptorを使わない、このファイルのような
// @main struct ... : App構成）でも、WatchKitはSwiftUIビューをWKHostingController
// （WKInterfaceControllerのサブクラス）でホストしているため、WKExtension.shared().
// visibleInterfaceControllerは引き続き解決できる（多くのwatchOS SwiftUIアプリで使われている
// 標準的なテクニック）。ただし実機・実際のwatchOSバージョンでの動作は必ず確認すること
// （このセッションではwatchOSシミュレータ/実機を操作できないため未検証）。
// 万一nilが返る場合に備え、プレーンなTextField（タップで同じダイクテーション選択肢が出る）を
// フォールバックとして用意してある
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

    var body: some View {
        VStack(spacing: 10) {
            switch state {
            case .idle:
                Button(action: startDictation) {
                    VStack(spacing: 6) {
                        Image(systemName: "mic.circle.fill")
                            .font(.system(size: 44))
                        Text("あとでやるに追加")
                            .font(.footnote)
                    }
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color(red: 217/255, green: 163/255, blue: 178/255))
                // フォールバック用（visibleInterfaceControllerがnilだった場合のみ表示される）
                if showFallbackField {
                    TextField("タスク名", text: $fallbackText, onCommit: {
                        submit(fallbackText)
                        fallbackText = ""
                        showFallbackField = false
                    })
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
        // 「思いついた瞬間に、とりあえず頭の外に出す」ことに特化させる方針のため、アプリを
        // 開いたらマイクボタンのタップを待たずに即座にダイクテーションへ入る。idle状態の時
        // だけ発火させることで、preview/sending等の途中でこのビューが再描画されても
        // 二重に開始しないようにしている
        .onAppear {
            if state == .idle { startDictation() }
        }
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

// Xcodeで新規作成する「Watch App」ターゲットに追加するファイル（Target: BrainBox Watch App）
//
// UIは「マイクボタン」＋状態表示のみ。日時設定・所要時間設定は意図的に持たない
// （「思いついた瞬間に、とりあえず頭の外に出す」ことに特化させる方針）。
// アプリを開いた瞬間（.onAppear）に、マイクボタンのタップを待たずに自動でダイクテーションを
// 開始する。マイクボタン自体は、キャンセル・空発話等でidleに戻った時の手動リトライ用に残す。
//
// 【音声入力の実装方法（変更履歴あり）】当初はWatchKitのpresentTextInputController
// （allowedInputMode: .plain）でシステム標準の入力選択画面を開く方式にしていたが、実機で
// 確認したところ「候補チップ/Scribble選択を完全にスキップする手段が無い」というAPIの制約により
// 手書き（Scribble）の画面が毎回先に出てしまい、「開いた瞬間にダイクテーションが始まる」という
// 狙った体験にならなかった。そのため、iOS版VoiceInputPluginと同じ方式（SFSpeechRecognizer＋
// AVAudioEngineの自前実装、WatchVoiceRecognizer.swift）に作り変えた。この方式では
// システムの入力選択画面を経由しないため、Watch App側のInfo.plistに
// NSMicrophoneUsageDescription / NSSpeechRecognitionUsageDescription の追加が必要
// （Xcodeの対象ターゲット → Info タブ → Custom watchOS Target Propertiesで追加する）。
import SwiftUI
import WatchKit

private enum FlowState: Equatable {
    case idle
    case dictating
    case preview(String)
    case sending
    case done
    case error(String)
}

struct ContentView: View {
    @EnvironmentObject var connector: WatchConnector
    @StateObject private var recognizer = WatchVoiceRecognizer()
    @State private var state: FlowState = .idle
    @State private var fallbackText: String = ""
    @State private var showFallbackField = false

    // iPhone側（設定 → 表示設定 → テーマカラー）が選んでいる色にマイクアイコンを追従させる。
    // まだWatchConnectorが受信できていない場合（初回起動直後等）は、アプリ全体の既定色
    // （#D9A3B2、ダスティピンク）にフォールバックする
    private var accentColor: Color {
        Color(hex: connector.themeColorHex ?? "#D9A3B2")
    }

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
                .foregroundStyle(accentColor)
                // マイク権限が無い場合等のフォールバック用（手入力で保存できるようにする）
                if showFallbackField {
                    TextField("タスク名", text: $fallbackText, onCommit: {
                        submit(fallbackText)
                        fallbackText = ""
                        showFallbackField = false
                    })
                }
            case .dictating:
                // もう一度タップすると、無音を待たずに早めに認識を打ち切れる
                Button(action: { recognizer.stop() }) {
                    VStack(spacing: 6) {
                        ProgressView()
                        Text("聞き取り中…タップで終了")
                            .font(.caption2)
                    }
                }
                .buttonStyle(.plain)
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
            case .error(let message):
                VStack(spacing: 6) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.system(size: 36))
                        .foregroundStyle(.red)
                    Text(message)
                        .font(.footnote)
                        .multilineTextAlignment(.center)
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
        recognizer.requestAuthorization { granted in
            guard granted else {
                state = .error("マイクの使用が許可されていません")
                showFallbackField = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { state = .idle }
                return
            }
            state = .dictating
            recognizer.start { text in
                let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty {
                    showPreviewThenSend(trimmed)
                } else {
                    state = .idle
                }
            }
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
        state = ok ? .done : .error("送信できませんでした")
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

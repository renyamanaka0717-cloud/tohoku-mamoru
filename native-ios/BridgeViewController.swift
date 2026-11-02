// Xcodeで ios/App/App/ に追加するファイル（Target: App）
// Capacitor 6+ はローカル（npm未経由）のカスタムプラグインを自動検出しないことがあるため、
// capacitorDidLoad() で明示的に登録する。
import Capacitor
import FirebaseCore

// ⚠️⚠️⚠️ 調査用デバッグフラグ ⚠️⚠️⚠️
// キーボード上部の角丸外側に黒い背景が見える不具合の原因レイヤーを特定するための
// 一時的な処理。trueの間だけ有効になる。原因が分かったら必ず false に戻すか、
// このフラグと DEBUG_IdentifyBlackLayer 拡張（ファイル末尾）ごと削除すること。
// これ以外の本番コードには一切影響しない（既存の背景色・設定はこのフラグをfalseに
// 戻すだけで何も変更せず元の状態に戻る＝このデバッグ処理は値を「上書き」はするが
// 「保存」はしておらず、falseにすればそもそも上書き自体が走らないので復元作業は不要）。
private let DEBUG_IdentifyBlackLayerEnabled = true

class BridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        // FirebaseApp.configure()はAnalytics等のFirebase APIを使う前に一度だけ呼べばよいため、
        // AppDelegateを編集せずこのBridgeViewControllerの初期化フックで完結させている
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
        bridge?.registerPluginInstance(AppIconPlugin())
        bridge?.registerPluginInstance(WidgetDataPlugin())
        bridge?.registerPluginInstance(GeofencePlugin())
        bridge?.registerPluginInstance(InactivityPlugin())
        bridge?.registerPluginInstance(LocalNotifyPlugin())
        bridge?.registerPluginInstance(AnalyticsPlugin())
        bridge?.registerPluginInstance(VoiceInputPlugin())
        bridge?.registerPluginInstance(WatchBridgePlugin())
        bridge?.registerPluginInstance(GoogleAuthPlugin())
        bridge?.registerPluginInstance(AppleAuthPlugin())

        if DEBUG_IdentifyBlackLayerEnabled {
            debug_setupBlackLayerInvestigation()
        }
    }
}

// MARK: - ⚠️ 調査用デバッグ処理（原因特定後にこの extension ごと削除すること） ⚠️
extension BridgeViewController {

    /// UIWindow・ルートView・WKWebView・WKWebViewのscrollViewに別々の色を付け、
    /// キーボード表示/非表示のたびに各ビューのframe・bounds・背景色・不透明度を
    /// コンソールに出力する。ビューの重なり順によっては色が見えないことがあるため、
    /// 色の目視確認と同時にログでも各ビューのサイズ・位置を突き合わせて判断する。
    fileprivate func debug_setupBlackLayerInvestigation() {
        // 初回・画面遷移直後は window がまだ付いていないことがあるため少し待つ
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            self?.debug_applyIdentifyColors()
            self?.debug_logViewState(context: "initial")
        }

        NotificationCenter.default.addObserver(
            forName: UIResponder.keyboardWillShowNotification, object: nil, queue: .main
        ) { [weak self] note in
            self?.debug_applyIdentifyColors() // キーボード表示のたびに色を再適用（念のため）
            self?.debug_logViewState(context: "keyboardWillShow", note: note)
        }
        NotificationCenter.default.addObserver(
            forName: UIResponder.keyboardDidShowNotification, object: nil, queue: .main
        ) { [weak self] note in
            self?.debug_logViewState(context: "keyboardDidShow", note: note)
        }
        NotificationCenter.default.addObserver(
            forName: UIResponder.keyboardWillHideNotification, object: nil, queue: .main
        ) { [weak self] note in
            self?.debug_logViewState(context: "keyboardWillHide", note: note)
        }
    }

    /// UIWindow=赤 / ルートView=青 / WKWebView=緑 / WKWebViewのscrollView=黄
    /// に塗り分ける。元の値は保存しない（DEBUG_IdentifyBlackLayerEnabledをfalseに
    /// 戻せばこの処理自体が走らなくなり、通常のCapacitor既定値に戻る）
    fileprivate func debug_applyIdentifyColors() {
        self.view.window?.backgroundColor = .systemRed
        self.view.backgroundColor = .systemBlue
        self.webView?.backgroundColor = .systemGreen
        self.webView?.scrollView.backgroundColor = .systemYellow
        print("🔴🔵🟢🟡 [DEBUG] 識別色を適用: window=赤 / view=青 / webView=緑 / webView.scrollView=黄")
    }

    fileprivate func debug_logViewState(context: String, note: Notification? = nil) {
        print("———— [DEBUG] \(context) ————")
        if let note = note, let endFrame = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue {
            print("  keyboard frameEnd: \(endFrame)")
        }
        if let window = self.view.window {
            print("  UIWindow: frame=\(window.frame) bounds=\(window.bounds) bg=\(String(describing: window.backgroundColor)) isOpaque=\(window.isOpaque)")
        } else {
            print("  UIWindow: (まだwindowにアタッチされていません)")
        }
        print("  rootView: frame=\(self.view.frame) bounds=\(self.view.bounds) bg=\(String(describing: self.view.backgroundColor)) isOpaque=\(self.view.isOpaque)")
        if let webView = self.webView {
            print("  WKWebView: frame=\(webView.frame) bounds=\(webView.bounds) bg=\(String(describing: webView.backgroundColor)) isOpaque=\(webView.isOpaque)")
            print("  WKWebView.scrollView: frame=\(webView.scrollView.frame) bounds=\(webView.scrollView.bounds) bg=\(String(describing: webView.scrollView.backgroundColor)) contentInset=\(webView.scrollView.contentInset)")
        } else {
            print("  WKWebView: (nil)")
        }
    }
}

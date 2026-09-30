// Xcodeで ios/App/App/ に追加するファイル（Target: App。Watch Appターゲットではない）
//
// Apple Watch版BrainBox（native-ios/Watch/）から WatchConnectivity 経由で届く「あとでやる」
// タスクのテキストを受け取り、他の「保留アクション」系プラグイン（WidgetDataPlugin.
// getPendingWidgetActions()・GeofencePlugin.getPendingGeofenceAction()）と全く同じ設計で
// UserDefaultsのキューに貯めておき、JS側がアプリ起動時/visibilitychange時にポーリングして
// 読み出す（notifyListenersのライブ配信は使わない）。
//
// 【この設計にした理由】WCSessionのメッセージ受信はアプリがバックグラウンド/未起動でも
// OSがアプリプロセスを起こして呼ばれることがあるが、その時点でCapacitorのWebView（JS実行環境）
// がまだ読み込まれておらず notifyListeners を安全に呼べる保証がない。他の保留アクション系
// プラグインと同じ「ネイティブは受け取って貯めるだけ、実際の反映はJSがフォアグラウンド復帰時に
// 読みに来る」というポーリング方式に統一することで、この問題を回避している。
//
// 【逆方向（iPhone→Watch）: テーマカラー同期】updateThemeColor()だけは逆方向の通信で、
// JS側（設定 → 表示設定 → テーマカラー変更時）から呼ばれ、WCSession.
// updateApplicationContext()でWatch側（WatchConnector.swift）に現在のテーマカラーを push
// する。こちらは「最新の状態を1つだけ保持する」用途のAPIなので、上記のポーリング方式とは
// 別物（プッシュ型で問題ない——アプリがバックグラウンドでもOSが自動的に配信してくれる）。
import Capacitor
import WatchConnectivity

@objc(WatchBridgePlugin)
public class WatchBridgePlugin: CAPPlugin, WCSessionDelegate {
    static let pendingKey = "pendingWatchTaskTexts"

    public override func load() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    @objc func getPendingWatchTasks(_ call: CAPPluginCall) {
        let defaults = UserDefaults.standard
        let texts = defaults.stringArray(forKey: WatchBridgePlugin.pendingKey) ?? []
        defaults.removeObject(forKey: WatchBridgePlugin.pendingKey)
        call.resolve(["texts": texts])
    }

    // 設定 → 表示設定 → テーマカラーが変わるたびに呼ばれ、Watch版のマイクアイコンの色を
    // 追従させる。updateApplicationContextは「最新の1件だけ保持される」設計のAPIのため、
    // 頻繁に呼んでも問題なく、Watch側は常に最新の色だけを受け取る（「あとでやる」送信で
    // 使うsendMessage/transferUserInfoとは逆方向・別の仕組み）
    @objc func updateThemeColor(_ call: CAPPluginCall) {
        guard let hex = call.getString("hex") else { call.resolve(); return }
        let session = WCSession.default
        guard session.activationState == .activated else { call.resolve(); return }
        try? session.updateApplicationContext(["themeColor": hex])
        call.resolve()
    }

    private func enqueue(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let defaults = UserDefaults.standard
        var texts = defaults.stringArray(forKey: WatchBridgePlugin.pendingKey) ?? []
        texts.append(trimmed)
        defaults.set(texts, forKey: WatchBridgePlugin.pendingKey)
    }

    // Watch側がreachable（Watchアプリが起動中・Bluetooth接続中）の時に送ってくる即時経路
    public func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        if let text = message["text"] as? String { enqueue(text) }
    }

    // Watch側がreachableでない場合のキュー配信経路（iPhone側がバックグラウンド/未起動でも、
    // OSが後で配信のためにアプリを起こして呼ぶことがある）
    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        if let text = userInfo["text"] as? String { enqueue(text) }
    }

    public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
    // iOSは複数Watchのペアリングに対応するため、この2つの実装が必須
    // （watchOS側のWCSessionDelegateには存在しない、iOS固有の要件）
    public func sessionDidBecomeInactive(_ session: WCSession) {}
    public func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate()
    }
}

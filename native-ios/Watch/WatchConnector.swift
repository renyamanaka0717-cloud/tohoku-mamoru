// Xcodeで新規作成する「Watch App」ターゲットに追加するファイル（Target: BrainBox Watch App）
//
// iPhone側は native-ios/WatchBridgePlugin.swift が受け手（WCSessionDelegate）。
// 「あとでやる」に追加する程度の軽いテキストしか送らないため、往復確認（replyHandler）は
// 実装しない——送信できたかどうかはこちらでは分からないが、transferUserInfo は
// ほぼ確実にローカルでキューイングに成功する（実際の配信はiPhoneが再び近くに来た時でよい）ため、
// 送信呼び出し自体が成功した時点で「あとでやる」に追加されたものとして楽観的にUIを進める設計にした。
// BrainBoxは「思いついた瞬間に頭の外に出す」ことを最優先にしているため、配信の遅延を
// ユーザーに気にさせない（買い物リストの場所通知等、他の「まず記録してから後で伝わればよい」
// 機能と同じ思想）
//
// 【iPhone→Watch方向の通信（テーマカラー同期）】上記の「あとでやる」送信とは逆方向で、
// iPhone側（WatchBridgePlugin.swift）がWCSession.updateApplicationContext()で現在の
// テーマカラーを送ってくる。updateApplicationContextは「最新の1件だけ保持される」設計の
// ため、頻繁に呼ばれても問題なく、常に最新の色だけが状態として残る（sendMessage/
// transferUserInfoのような個々のメッセージの蓄積ではない点が「あとでやる」送信と異なる）
import Combine
import Foundation
import WatchConnectivity

final class WatchConnector: NSObject, ObservableObject, WCSessionDelegate {
    // activate()は起動時に呼ぶが完了は非同期のため、アプリを開いてすぐダイクテーションを
    // 終えて送信しようとすると、activationDidCompleteWithがまだ来ていないことがある
    // （実際に「送信できませんでした」になる不具合として発生した）。「まず記録できたら
    // 安心させる」方針に反してこの一瞬のタイミング差だけで失敗扱いにしないよう、未活性化中は
    // ここにキューイングしておき、activation完了時にまとめて送る
    private var pendingTexts: [String] = []

    // iPhone側（設定 → 表示設定 → テーマカラー）が選んでいる現在のテーマカラーをここで
    // 保持する。ContentViewのマイクアイコンの色をこれに追従させ、Watch単体でも
    // iPhone側と同じ配色に見えるようにする。iPhone→Watchはこのアプリでは唯一の
    // 逆方向通信で、「あとでやる」送信（Watch→iPhone）とは完全に独立している
    @Published var themeColorHex: String?

    override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
        // 起動時点で既にiPhoneから届いていたapplicationContextを読む。
        // didReceiveApplicationContextは「新規に届いた時」しか呼ばれないため、
        // 起動前から保持済みの値はここで拾わないと反映されない
        themeColorHex = session.receivedApplicationContext["themeColor"] as? String
    }

    // reachable（iPhoneアプリが起動中でBluetooth/WiFi到達可能）ならその場で即座に届く
    // sendMessage を優先し、reachableでなければ transferUserInfo（キュー配信、いつか届く）に
    // フォールバックする。どちらのAPIも同期的には配信結果が分からないため、呼び出し自体が
    // 例外を投げなければ成功とみなす
    func send(_ text: String) -> Bool {
        let session = WCSession.default
        guard session.activationState == .activated else {
            pendingTexts.append(text)
            return true
        }
        deliver(text, session: session)
        return true
    }

    private func deliver(_ text: String, session: WCSession) {
        if session.isReachable {
            session.sendMessage(["text": text], replyHandler: nil, errorHandler: nil)
        } else {
            session.transferUserInfo(["text": text])
        }
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        guard activationState == .activated else { return }
        if !pendingTexts.isEmpty {
            let texts = pendingTexts
            pendingTexts = []
            texts.forEach { deliver($0, session: session) }
        }
        if let hex = session.receivedApplicationContext["themeColor"] as? String {
            DispatchQueue.main.async { self.themeColorHex = hex }
        }
    }

    // iPhone側がWCSession.updateApplicationContext()でテーマカラーを送ってくるたびに呼ばれる
    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        guard let hex = applicationContext["themeColor"] as? String else { return }
        DispatchQueue.main.async { self.themeColorHex = hex }
    }
}

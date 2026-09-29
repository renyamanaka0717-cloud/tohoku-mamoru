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
import Combine
import Foundation
import WatchConnectivity

final class WatchConnector: NSObject, ObservableObject, WCSessionDelegate {
    override init() {
        super.init()
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    // reachable（iPhoneアプリが起動中でBluetooth/WiFi到達可能）ならその場で即座に届く
    // sendMessage を優先し、reachableでなければ transferUserInfo（キュー配信、いつか届く）に
    // フォールバックする。どちらのAPIも同期的には配信結果が分からないため、呼び出し自体が
    // 例外を投げなければ成功とみなす
    func send(_ text: String) -> Bool {
        let session = WCSession.default
        guard session.activationState == .activated else { return false }
        if session.isReachable {
            session.sendMessage(["text": text], replyHandler: nil, errorHandler: nil)
        } else {
            session.transferUserInfo(["text": text])
        }
        return true
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
}

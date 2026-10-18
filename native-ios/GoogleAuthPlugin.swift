// Xcodeで ios/App/App/ に追加するファイル（Target: App）
//
// 事前準備:
// 1. Xcode → File → Add Package Dependencies → https://github.com/google/GoogleSignIn-iOS
//    を追加（製品: GoogleSignIn, Target: App）
// 2. GoogleService-Info.plist（Analytics用に既に追加済みのもの）内のREVERSED_CLIENT_ID値を
//    ios/App/App/Info.plistのURLスキームとして登録する（native-ios/Info.plist.snippet.xmlの
//    コメント参照、またはXcodeのTARGETS→App→Info→URL Typesから手動追加）。
//    クライアントID自体はGoogleService-Info.plistから取得するため、別途Info.plistに
//    書き込む必要はない（FirebaseApp.app()?.options.clientIDで取得する）
//
// Google Sign-InのWebベース認証完了後、ブラウザからこのURLスキームでアプリに戻ってくる。
// AppDelegate.swiftは編集せず、Capacitorが application(_:open:options:) の際に発行する
// CAPPluginURLOpen通知を購読して完結させる（他のプラグインと同じ「AppDelegateは触らない」方針）
import Capacitor
import GoogleSignIn
import FirebaseCore

@objc(GoogleAuthPlugin)
public class GoogleAuthPlugin: CAPPlugin {
    public override func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(handleOpenUrl(_:)), name: Notification.Name(CAPNotifications.URLOpen.name()), object: nil)
    }

    @objc func handleOpenUrl(_ notification: Notification) {
        guard let object = notification.object as? [String: Any], let url = object["url"] as? URL else { return }
        GIDSignIn.sharedInstance.handle(url)
    }

    @objc func signIn(_ call: CAPPluginCall) {
        guard let presentingVc = bridge?.viewController else {
            call.reject("no_view_controller")
            return
        }
        guard let clientID = FirebaseApp.app()?.options.clientID else {
            call.reject("firebase_not_configured")
            return
        }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        DispatchQueue.main.async {
            GIDSignIn.sharedInstance.signIn(withPresenting: presentingVc) { result, error in
                if let error = error {
                    call.reject("sign_in_failed", nil, error)
                    return
                }
                guard let idToken = result?.user.idToken?.tokenString else {
                    call.reject("no_id_token")
                    return
                }
                call.resolve([
                    "idToken": idToken,
                    "accessToken": result?.user.accessToken.tokenString ?? "",
                ])
            }
        }
    }
}

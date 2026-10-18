// Xcodeで ios/App/App/ に追加するファイル（Target: App）
// 追加のSDK・Podは不要（iOS標準のAuthenticationServicesフレームワークのみ）。
// 事前にXcodeの「Signing & Capabilities」→「+ Capability」→「Sign in with Apple」を
// 有効化しておくこと（Apple Developer側の証明書/App ID設定にも反映される）
import Capacitor
import AuthenticationServices

@objc(AppleAuthPlugin)
public class AppleAuthPlugin: CAPPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    // ASAuthorizationControllerのdelegateコールバックは呼び出し元のCAPPluginCallを
    // 直接受け取れないため、signIn()実行中のcallをここに保持してdelegateから参照する
    private var pendingCall: CAPPluginCall?

    @objc func signIn(_ call: CAPPluginCall) {
        guard let nonce = call.getString("nonce") else {
            call.reject("nonce is required")
            return
        }
        pendingCall = call
        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]
        // 生のnonceはFirebase側のcredential生成時に使うため、Apple側へはそのSHA256ハッシュを渡す
        // （呼び出し元のCloud.tsが既にハッシュ化した値をここに渡してくる）
        request.nonce = nonce
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        DispatchQueue.main.async {
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8) else {
            call.reject("no_id_token")
            return
        }
        call.resolve(["idToken": idToken])
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = pendingCall else { return }
        pendingCall = nil
        call.reject("sign_in_failed", nil, error)
    }
}

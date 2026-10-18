// android/app/src/main/java/jp/brainbox/app/ にコピーするファイル
//
// 事前準備:
// 1. android/app/build.gradle の dependencies に
//    implementation "com.google.android.gms:play-services-auth:21.2.0" を追加
// 2. Firebase Console → Authentication → Sign-in method → Google を有効化しておくこと
//    （有効化すると、Android用のOAuth 2.0クライアントID「ウェブ アプリケーション」種別のものが
//    自動生成され、google-services.jsonに含まれるようになる。これが無いと
//    R.string.default_web_client_id が生成されずビルドエラーになる）
// 3. 2.の後、最新のgoogle-services.jsonを再ダウンロードしてandroid/app/に上書きすること
//
// iOS版のGoogleAuthPluginと同じく、ネイティブ側はGoogleのidTokenを取得して返すだけに留め、
// Firebase Authへのサインイン自体はJS側（Cloud.ts）のsignInWithCredential()で行う
// （ネイティブのFirebaseAuth SDKで直接サインインすると、JS SDK側のauthセッションとは
// 別の独立したセッションになってしまうため）。
//
// 【既知の制約】GoogleSignInClient（Google Sign-In for Android、com.google.android.gms:play-services-auth）
// は現在Googleの新しい推奨API「Credential Manager」に置き換わりつつある（classic APIという位置づけ）。
// ただし現時点ではまだ動作し、Credential Manager移行は追加の依存関係（androidx.credentials等）と
// minSdkVersion要件の確認が必要なため、まずは実績のあるこちらの方式で実装している。
// 将来的な移行候補として認識しておくこと
package jp.brainbox.app

import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException

@CapacitorPlugin(name = "GoogleAuthPlugin")
class GoogleAuthPlugin : Plugin() {
    // Firebase Console側のGoogleプロバイダ設定（default_web_client_idの自動生成元）が
    // まだ済んでいない環境でも、アプリ起動時（load()）にクラッシュしないよう、
    // クライアント生成はsignIn()が呼ばれた時まで遅延する
    private fun buildClient(): GoogleSignInClient? {
        val resId = context.resources.getIdentifier("default_web_client_id", "string", context.packageName)
        if (resId == 0) return null
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(context.getString(resId))
            .requestEmail()
            .build()
        return GoogleSignIn.getClient(context, gso)
    }

    @PluginMethod
    fun signIn(call: PluginCall) {
        val client = buildClient()
        if (client == null) {
            call.reject("google_sign_in_not_configured")
            return
        }
        startActivityForResult(call, client.signInIntent, "handleSignInResult")
    }

    @ActivityCallback
    private fun handleSignInResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        try {
            val account = GoogleSignIn.getSignedInAccountFromIntent(result.data).getResult(ApiException::class.java)
            val idToken = account?.idToken
            if (idToken == null) {
                call.reject("no_id_token")
                return
            }
            val ret = JSObject()
            ret.put("idToken", idToken)
            call.resolve(ret)
        } catch (e: ApiException) {
            call.reject("sign_in_failed", e)
        }
    }
}

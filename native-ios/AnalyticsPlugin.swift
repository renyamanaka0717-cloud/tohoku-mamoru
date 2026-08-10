// Xcodeで ios/App/App/ に追加するファイル（Target: App）
// 事前にFirebase iOS SDKをSwift Package Manager経由で追加し、GoogleService-Info.plistを
// ios/App/App/ に追加しておくこと（詳細はCLAUDE.mdのFirebase Analytics節を参照）。
// FirebaseAnalyticsがまだリンクされていない状態でこのファイルをXcodeに追加すると
// `import FirebaseAnalytics` でビルドエラーになる
import Capacitor
import FirebaseAnalytics

@objc(AnalyticsPlugin)
public class AnalyticsPlugin: CAPPlugin {
    // paramsはフラットな{String: String|Number|Bool}のJSONのみを想定
    // （Firebase Analyticsのイベントパラメータはネストしたオブジェクト・配列を扱えないため）
    @objc func logEvent(_ call: CAPPluginCall) {
        guard let name = call.getString("name") else {
            call.reject("name is required")
            return
        }
        var params: [String: Any]? = nil
        if let paramsJson = call.getString("params"),
           let data = paramsJson.data(using: .utf8),
           let decoded = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            params = decoded
        }
        Analytics.logEvent(name, parameters: params)
        call.resolve()
    }

    // ユーザープロパティ（イベントではなくユーザー単位の属性）を設定する。
    // 例: app_language=ja|en で言語別の機能利用率等をGA4側でセグメント比較できるようにする
    @objc func setUserProperty(_ call: CAPPluginCall) {
        guard let name = call.getString("name") else {
            call.reject("name is required")
            return
        }
        let value = call.getString("value")
        Analytics.setUserProperty(value, forName: name)
        call.resolve()
    }
}

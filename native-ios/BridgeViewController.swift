// Xcodeで ios/App/App/ に追加するファイル（Target: App）
// Capacitor 6+ はローカル（npm未経由）のカスタムプラグインを自動検出しないことがあるため、
// capacitorDidLoad() で明示的に登録する。
import Capacitor
import FirebaseCore

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
    }
}

// Xcodeで ios/App/App/ に追加するファイル（Target: App）
// Capacitor 6+ はローカル（npm未経由）のカスタムプラグインを自動検出しないことがあるため、
// capacitorDidLoad() で明示的に登録する。
import Capacitor

class BridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AppIconPlugin())
        bridge?.registerPluginInstance(WidgetDataPlugin())
    }
}

// Xcodeで ios/App/App/ に追加するファイル（Target: App）
import Capacitor

@objc(AppIconPlugin)
public class AppIconPlugin: CAPPlugin {
    @objc func setAppIcon(_ call: CAPPluginCall) {
        guard let name = call.getString("name") else {
            call.reject("name is required")
            return
        }
        guard UIApplication.shared.supportsAlternateIcons else {
            call.reject("Alternate icons not supported on this device")
            return
        }
        // "mint" はプライマリアイコン（Info.plistに登録しない = nilで復元）
        let iconName = (name == "mint") ? nil : "AppIcon-\(name.prefix(1).uppercased() + name.dropFirst())"
        DispatchQueue.main.async {
            UIApplication.shared.setAlternateIconName(iconName) { error in
                if let error = error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve()
                }
            }
        }
    }
}

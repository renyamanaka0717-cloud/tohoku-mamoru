// Xcodeで ios/App/App/ に追加するファイル（Target: App）
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(AppIconPlugin, "AppIconPlugin",
  CAP_PLUGIN_METHOD(setAppIcon, CAPPluginReturnPromise);
)

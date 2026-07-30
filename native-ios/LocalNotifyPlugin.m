// Xcodeで ios/App/App/ に追加するファイル（Target: App）
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(LocalNotifyPlugin, "LocalNotifyPlugin",
  CAP_PLUGIN_METHOD(notify, CAPPluginReturnPromise);
)

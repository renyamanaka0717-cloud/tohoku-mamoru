// Xcodeで ios/App/App/ に追加するファイル（Target: App）
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(WatchBridgePlugin, "WatchBridgePlugin",
  CAP_PLUGIN_METHOD(getPendingWatchTasks, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(updateThemeColor, CAPPluginReturnPromise);
)

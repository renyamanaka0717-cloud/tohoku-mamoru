// Xcodeで ios/App/App/ に追加するファイル（Target: App）
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(LocalNotifyPlugin, "LocalNotifyPlugin",
  CAP_PLUGIN_METHOD(notify, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(requestPermission, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(syncTaskAlerts, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(syncFreeSlotAlerts, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(syncShopNotifs, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(syncLaterStaleAlerts, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(syncWakeCheckins, CAPPluginReturnPromise);
)

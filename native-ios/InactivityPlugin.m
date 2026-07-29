// Xcodeで ios/App/App/ に追加するファイル（Target: App）
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(InactivityPlugin, "InactivityPlugin",
  CAP_PLUGIN_METHOD(scheduleReminder, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(cancelReminder, CAPPluginReturnPromise);
)

// Xcodeで ios/App/App/ に追加するファイル（Target: App）
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(AnalyticsPlugin, "AnalyticsPlugin",
  CAP_PLUGIN_METHOD(logEvent, CAPPluginReturnPromise);
)

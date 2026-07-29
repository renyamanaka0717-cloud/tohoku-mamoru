// Xcodeで ios/App/App/ に追加するファイル（Target: App）
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(WidgetDataPlugin, "WidgetDataPlugin",
  CAP_PLUGIN_METHOD(updateWidgetData, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getPendingWidgetActions, CAPPluginReturnPromise);
)

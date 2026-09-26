// Xcodeで ios/App/App/ に追加するファイル（Target: App）
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(VoiceInputPlugin, "VoiceInputPlugin",
  CAP_PLUGIN_METHOD(requestPermissions, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(checkPermissions, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
)

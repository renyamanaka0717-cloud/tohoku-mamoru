// Xcodeで ios/App/App/ に追加するファイル（Target: App）
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(AppleAuthPlugin, "AppleAuthPlugin",
  CAP_PLUGIN_METHOD(signIn, CAPPluginReturnPromise);
)

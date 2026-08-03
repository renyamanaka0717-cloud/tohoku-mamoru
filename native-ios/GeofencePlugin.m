// Xcodeで ios/App/App/ に追加するファイル（Target: App）
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(GeofencePlugin, "GeofencePlugin",
  CAP_PLUGIN_METHOD(setGeofences, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(setTaskLocationGeofences, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(requestPermissions, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(checkPermissions, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getPendingGeofenceAction, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getFiredTaskLocationIds, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(getCurrentLocation, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(openAppSettings, CAPPluginReturnPromise);
)

// android/app/src/main/java/jp/brainbox/app/MainActivity.java をこの内容に差し替える
// (registerPlugin()の行を追加しないとLocalNotifyPlugin/GeofencePlugin/InactivityPlugin/AnalyticsPlugin/
// AppIconPlugin/VoiceInputPlugin/WidgetDataPluginがAndroidに認識されない。iOS版のBridgeViewController.
// capacitorDidLoad()でのプラグイン登録と同じ役割)
package jp.brainbox.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalNotifyPlugin.class);
        registerPlugin(GeofencePlugin.class);
        registerPlugin(InactivityPlugin.class);
        registerPlugin(AnalyticsPlugin.class);
        registerPlugin(AppIconPlugin.class);
        registerPlugin(VoiceInputPlugin.class);
        registerPlugin(WidgetDataPlugin.class);
        super.onCreate(savedInstanceState);
        handleNotificationIntent(getIntent());
    }

    // launchMode="singleTask"のため、アプリ起動中に通知をタップした場合はonCreateではなく
    // こちらが呼ばれる
    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleNotificationIntent(intent);
    }

    // 通知タップで起動された場合、BrainBoxNotifications.show()がlaunchIntentに付けた
    // fromNotification/openShop/openLater extraを読み、GeofencePlugin.getPendingGeofenceAction()
    // が読み取るのと同じSharedPreferencesにフラグを書き込む。iOS版でGeofencePlugin.swiftの
    // UNUserNotificationCenterDelegate.didReceive が全通知カテゴリ共通で担っている役割を、
    // Android側ではこのMainActivityに集約している
    private void handleNotificationIntent(Intent intent) {
        if (intent == null || !intent.getBooleanExtra("fromNotification", false)) return;
        SharedPreferences prefs = getSharedPreferences(GeofencePlugin.PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putBoolean("pendingNotificationOpened", true);
        if (intent.getBooleanExtra("openShop", false)) editor.putBoolean("pendingOpenShopList", true);
        if (intent.getBooleanExtra("openLater", false)) editor.putBoolean("pendingOpenLaterList", true);
        editor.apply();
    }
}

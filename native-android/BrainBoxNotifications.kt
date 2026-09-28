// Android Studioで android/app/src/main/java/jp/brainbox/app/ に追加するファイル
package jp.brainbox.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

// LocalNotifyPlugin（フォアグラウンドからの即時通知）とLocalNotifyReceiver（AlarmManagerに
// よる事前予約からの発火）の両方から呼ばれる共通の通知表示ロジック。iOS版と違い通知チャンネルを
// 明示的に作る必要がある（Android 8+ではチャンネル無しの通知は表示されない）
object BrainBoxNotifications {
    const val CHANNEL_ID = "brainbox_default"

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (manager.getNotificationChannel(CHANNEL_ID) == null) {
                val channel = NotificationChannel(CHANNEL_ID, "BrainBox", NotificationManager.IMPORTANCE_DEFAULT)
                manager.createNotificationChannel(channel)
            }
        }
    }

    // タップ時のディープリンク（買い物リスト/あとでやるを開く）はGeofencePlugin/MainActivityに集約する
    // （iOS版もUNUserNotificationCenterDelegateをGeofencePlugin側に集約しているため、同じ設計に揃える）。
    // fromNotification は openShop/openLater が無い通常の通知でも、タップされたこと自体を
    // MainActivityが検知してpendingNotificationOpenedフラグを立てるために常に付ける
    fun show(context: Context, notifId: Int, title: String, body: String, openShop: Boolean, openLater: Boolean = false) {
        ensureChannel(context)
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        launchIntent?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        launchIntent?.putExtra("fromNotification", true)
        if (openShop) launchIntent?.putExtra("openShop", true)
        if (openLater) launchIntent?.putExtra("openLater", true)
        val contentIntent = PendingIntent.getActivity(
            context, notifId, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(context.applicationInfo.icon)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(notifId, notification)
        } catch (e: SecurityException) {
            // 通知許可が無い場合は無視（アプリをクラッシュさせない）
        }
    }
}

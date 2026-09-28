// Android Studioで android/app/src/main/java/jp/brainbox/app/ に追加するファイル
// WebViewはWeb Notifications APIを実装していないため、アプリ内の通知はすべてこのプラグイン
// 経由でAndroidのNotificationManagerに直接出す（iOS版LocalNotifyPluginと同じ設計方針・
// registerPlugin('LocalNotifyPlugin')の名前もJS側と揃えているため、src/app/components/
// LocalNotify.tsはこのファイルを追加するだけで無改修のままAndroidでも動く）
package jp.brainbox.app

import android.Manifest
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.PermissionState
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONArray
import org.json.JSONObject

@CapacitorPlugin(
    name = "LocalNotifyPlugin",
    permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")]
)
class LocalNotifyPlugin : Plugin() {
    companion object {
        const val PREFS_NAME = "local_notify_prefs"
        // syncTaskAlerts等が呼ばれるたびに、同じprefixの予約を全解除してから渡された内容で
        // 登録し直す（iOS版のgetPendingNotificationRequests+removePendingと同じ全解除→再登録方式）。
        // AndroidのAlarmManagerには「登録済み一覧を取得するAPI」が無いため、SharedPreferencesに
        // prefixごとの全アラートJSONをそのまま保存して自前で管理する（BootReceiverの再予約にも使う）
        val PREFIXES = listOf("task-alert-", "free-slot-", "shop-notif-", "later-stale-", "wake-checkin-", "deadline-")
    }

    private fun hasNotificationPermission(): Boolean {
        // POST_NOTIFICATIONSはAndroid 13(Tiramisu)以降のみ存在する実行時権限。
        // それより前のバージョンは常に許可済み扱いでよい
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return getPermissionState("notifications") == PermissionState.GRANTED
    }

    // 「通知を有効にする」ボタン等、実際の通知内容が無いタイミングでもその場で
    // 許可ダイアログを出すためのメソッド（notify()内のリクエストは通知発火時まで待たされる）
    @PluginMethod
    fun requestPermission(call: PluginCall) {
        if (hasNotificationPermission()) {
            call.resolve()
        } else {
            requestPermissionForAlias("notifications", call, "requestPermissionCallback")
        }
    }

    @PermissionCallback
    private fun requestPermissionCallback(call: PluginCall) {
        call.resolve()
    }

    @PluginMethod
    fun notify(call: PluginCall) {
        if (hasNotificationPermission()) {
            showNow(call)
        } else {
            requestPermissionForAlias("notifications", call, "notifyPermissionCallback")
        }
    }

    @PermissionCallback
    private fun notifyPermissionCallback(call: PluginCall) {
        if (hasNotificationPermission()) showNow(call) else call.resolve()
    }

    private fun showNow(call: PluginCall) {
        val title = call.getString("title") ?: ""
        val body = call.getString("body") ?: ""
        BrainBoxNotifications.show(context, (0..Int.MAX_VALUE).random(), title, body, false)
        call.resolve()
    }

    @PluginMethod fun syncTaskAlerts(call: PluginCall) { scheduleAlerts("task-alert-", call) }
    @PluginMethod fun syncFreeSlotAlerts(call: PluginCall) { scheduleAlerts("free-slot-", call) }
    @PluginMethod fun syncShopNotifs(call: PluginCall) { scheduleAlerts("shop-notif-", call) }
    @PluginMethod fun syncLaterStaleAlerts(call: PluginCall) { scheduleAlerts("later-stale-", call) }
    @PluginMethod fun syncWakeCheckins(call: PluginCall) { scheduleAlerts("wake-checkin-", call) }
    @PluginMethod fun syncDeadlineAlerts(call: PluginCall) { scheduleAlerts("deadline-", call) }

    private fun scheduleAlerts(prefix: String, call: PluginCall) {
        val json = call.getString("alertsJson") ?: "[]"
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

        // 既存のこのprefixぶんの予約を全解除
        cancelStored(prefix, prefs, alarmManager)

        val array: JSONArray
        try {
            array = JSONArray(json)
        } catch (e: Exception) {
            call.reject("invalid alertsJson")
            return
        }

        // 既に通知許可が下りている場合のみ予約する（iOS版と同じ方針。ここで許可を求めると、
        // 意図しないタイミングでOSの許可ダイアログが出てしまう不具合の実績があるため）
        if (!hasNotificationPermission()) {
            prefs.edit().putString(prefix, "[]").apply()
            call.resolve()
            return
        }

        for (i in 0 until array.length()) {
            scheduleOne(alarmManager, array.getJSONObject(i))
        }
        prefs.edit().putString(prefix, json).apply()
        call.resolve()
    }

    private fun scheduleOne(alarmManager: AlarmManager, alert: JSONObject) {
        val id = alert.getString("id")
        val timestamp = alert.getDouble("timestamp") // Unix epoch秒（iOS版と同じ単位）
        val triggerAtMillis = (timestamp * 1000).toLong()
        if (triggerAtMillis <= System.currentTimeMillis()) return // 過去の時刻は予約しない

        val intent = Intent(context, LocalNotifyReceiver::class.java).apply {
            putExtra("id", id)
            putExtra("title", alert.getString("title"))
            putExtra("body", alert.getString("body"))
            putExtra("openShop", alert.optBoolean("openShop", false))
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context, id.hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        try {
            // Android 12+は「正確なアラーム」に別途権限が必要。無い端末ではおおよその時刻で妥協する
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
            } else {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
            }
        } catch (e: SecurityException) {
            // 権限拒否等で例外が飛んでもアプリ全体をクラッシュさせない
        }
    }

    private fun cancelStored(prefix: String, prefs: android.content.SharedPreferences, alarmManager: AlarmManager) {
        val stored = prefs.getString(prefix, "[]") ?: "[]"
        try {
            val array = JSONArray(stored)
            for (i in 0 until array.length()) {
                val id = array.getJSONObject(i).getString("id")
                val intent = Intent(context, LocalNotifyReceiver::class.java)
                val pendingIntent = PendingIntent.getBroadcast(
                    context, id.hashCode(), intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                alarmManager.cancel(pendingIntent)
            }
        } catch (e: Exception) {
            // 壊れた保存データは無視
        }
    }
}

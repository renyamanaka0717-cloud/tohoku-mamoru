// Android Studioで android/app/src/main/java/jp/brainbox/app/ に追加するファイル
package jp.brainbox.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray

// AlarmManagerで予約したアラームは端末の再起動で全て消えてしまうため、再起動後に
// SharedPreferences（LocalNotifyPlugin.scheduleAlertsが保存したもの）から各カテゴリの
// アラート一覧を読み出し、まだ未来の時刻のものだけを再予約する。JS側がsyncTaskAlerts等を
// 呼び直すのを待たずに、再起動直後から自動で復元される
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val prefs = context.getSharedPreferences(LocalNotifyPlugin.PREFS_NAME, Context.MODE_PRIVATE)
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val nowMillis = System.currentTimeMillis()

        for (prefix in LocalNotifyPlugin.PREFIXES) {
            val json = prefs.getString(prefix, "[]") ?: "[]"
            try {
                val array = JSONArray(json)
                for (i in 0 until array.length()) {
                    val alert = array.getJSONObject(i)
                    val timestamp = alert.getDouble("timestamp")
                    val triggerAtMillis = (timestamp * 1000).toLong()
                    if (triggerAtMillis <= nowMillis) continue

                    val id = alert.getString("id")
                    val alarmIntent = Intent(context, LocalNotifyReceiver::class.java).apply {
                        putExtra("id", id)
                        putExtra("title", alert.getString("title"))
                        putExtra("body", alert.getString("body"))
                        putExtra("openShop", alert.optBoolean("openShop", false))
                    }
                    val pendingIntent = PendingIntent.getBroadcast(
                        context, id.hashCode(), alarmIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
                        } else {
                            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
                        }
                    } catch (e: SecurityException) {
                        // 無視
                    }
                }
            } catch (e: Exception) {
                // 壊れた保存データは無視
            }
        }
    }
}

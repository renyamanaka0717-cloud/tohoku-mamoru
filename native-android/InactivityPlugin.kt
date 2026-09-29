// Android Studioで android/app/src/main/java/jp/brainbox/app/ に追加するファイル
// iOS版InactivityPlugin.swiftのAndroid移植。プラグイン名をInactivityPluginで揃えているため、
// src/app/components/Inactivity.tsは無改修で動く。
//
// 【iOSとの差分（自前ブックキーピングが不要な理由）】LocalNotifyPlugin.ktは"task-alert-${taskId}-..."
// のようにIDが可変（タスクの数だけ増減する）ため、SharedPreferencesに登録済みID一覧を保存する
// 必要があった。InactivityPluginの識別子は"app-inactivity-reminder-${index}"というhoursListの
// 配列インデックスのみで、hoursListの長さは高々STALE_MAX_REPEATS+1件（page.tsx側で計算、実質6件
// 程度）と小さく上限が決まっている。存在しないPendingIntentをcancelしても何も起きないため、
// 毎回0〜MAX_REMINDERSの範囲を無条件にcancelすれば「全解除」が実現でき、ブックキーピング自体が不要
package jp.brainbox.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "InactivityPlugin")
class InactivityPlugin : Plugin() {
    companion object {
        const val PREFIX = "app-inactivity-reminder-"
        // hoursListの想定最大件数(STALE_MAX_REPEATS+1)より十分大きい安全マージン
        const val MAX_REMINDERS = 20
    }

    @PluginMethod
    fun scheduleReminder(call: PluginCall) {
        val hoursList = call.getArray("hoursList")?.toList()?.mapNotNull { (it as? Number)?.toDouble() } ?: emptyList()
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        cancelAll(alarmManager)

        if (hoursList.isEmpty()) { call.resolve(); return }
        // LocalNotifyPluginと同じ理由でrequestAuthorizationは使わない：バックグラウンド移行のたびに
        // 走るこの事前予約が、オンボーディングの通知プロンプトより前に勝手にOSの許可ダイアログを
        // 出してしまうため、既に許可済みの場合のみ予約する
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) { call.resolve(); return }

        hoursList.forEachIndexed { index, hours ->
            if (hours <= 0) return@forEachIndexed
            val triggerAtMillis = System.currentTimeMillis() + (hours * 3600 * 1000).toLong()
            val intent = Intent(context, LocalNotifyReceiver::class.java).apply {
                putExtra("id", "$PREFIX$index")
                putExtra("title", "しばらく開いていません")
                putExtra("body", "今日のタスクを確認しましょう")
                putExtra("openShop", false)
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context, "$PREFIX$index".hashCode(), intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                    alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
                } else {
                    alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent)
                }
            } catch (e: SecurityException) {
                // 権限拒否等で例外が飛んでもアプリ全体をクラッシュさせない
            }
        }
        call.resolve()
    }

    @PluginMethod
    fun cancelReminder(call: PluginCall) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        cancelAll(alarmManager)
        call.resolve()
    }

    private fun cancelAll(alarmManager: AlarmManager) {
        for (index in 0 until MAX_REMINDERS) {
            val id = "$PREFIX$index"
            val intent = Intent(context, LocalNotifyReceiver::class.java)
            val pendingIntent = PendingIntent.getBroadcast(
                context, id.hashCode(), intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            alarmManager.cancel(pendingIntent)
        }
    }
}

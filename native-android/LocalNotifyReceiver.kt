// Android Studioで android/app/src/main/java/jp/brainbox/app/ に追加するファイル
package jp.brainbox.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// AlarmManagerで事前予約されたアラームが発火した時にOSから呼ばれる。
// LocalNotifyPlugin.scheduleOne()がputExtraで詰めたtitle/bodyをそのまま通知にする
class LocalNotifyReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra("id") ?: return
        val title = intent.getStringExtra("title") ?: ""
        val body = intent.getStringExtra("body") ?: ""
        val openShop = intent.getBooleanExtra("openShop", false)
        BrainBoxNotifications.show(context, id.hashCode(), title, body, openShop)
    }
}

// Android Studioで android/app/src/main/java/jp/brainbox/app/ に追加するファイル
// iOS版 AddLaterVoiceWidget（AddLaterWidgetと同じsystemSmall、URLスキームだけ別）のAndroid移植。
// brainbox://addLaterVoice でMainActivityを起動する。AddLaterWidgetProviderとほぼ同じ内容だが、
// iOS版が別Widget構造体として分けている設計に合わせ、あえて共通化せず別Providerのまま書いている
package jp.brainbox.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

class AddLaterVoiceWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.widget_add_later_voice)
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("brainbox://addLaterVoice")).apply {
                setPackage(context.packageName)
            }
            val pi = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.add_later_voice_root, pi)
            appWidgetManager.updateAppWidget(id, views)
        }
    }
}

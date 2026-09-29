// Android Studioで android/app/src/main/java/jp/brainbox/app/ に追加するファイル
// iOS版 AddLaterWidget（systemSmall、「あとでやる」タスクをワンタップで追加）のAndroid移植。
// 新しいCapacitorプラグインやSharedPreferences経由のpendingフラグは増やさず、iOS版と同じ
// brainbox://addLater というURLスキームでMainActivityを起動するだけ（Capacitorの標準的な
// ディープリンク処理にそのまま乗る。JS側のappUrlOpenリスナーは無改修で動く）
package jp.brainbox.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

class AddLaterWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) {
            val views = RemoteViews(context.packageName, R.layout.widget_add_later)
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse("brainbox://addLater")).apply {
                setPackage(context.packageName)
            }
            val pi = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(R.id.add_later_root, pi)
            appWidgetManager.updateAppWidget(id, views)
        }
    }
}

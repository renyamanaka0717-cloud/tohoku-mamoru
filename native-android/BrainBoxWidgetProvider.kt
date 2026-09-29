// Android Studioで android/app/src/main/java/jp/brainbox/app/ に追加するファイル
// iOS版 native-ios/Widgets/BrainBoxWidgets.swift の CombinedWidget（次の予定 & 買い物リスト、
// 2カラム統合ウィジェット）のAndroid移植。iOSのWidgetKit（SwiftUI + TimelineProvider）とは仕組みが
// 根本的に異なり、AndroidはAppWidgetProvider + RemoteViews（あらかじめ決めた固定レイアウトの
// 一部だけをリモートで差し替える方式）で実装する。
//
// 【タップ完了機能】iOSはiOS 17+のAppIntent（Button(intent:)）でウィジェット内から直接ボタンとして
// 実行できるが、Androidの通常のRemoteViewsはボタンにコードを埋め込めない。代わりに行ごとに異なる
// PendingIntent（本Provider自身へのブロードキャスト、requestCodeとputExtraでidを区別）を
// setOnClickPendingIntent()で割り当て、onReceive()でタップされたidをpending配列に追記→
// updateAll()で即座に再描画する（＝WidgetDataPlugin.getPendingWidgetActions()が読み取るまでの間、
// ウィジェット上でだけ楽観的に消える。iOS版のCompleteTaskIntent/PurchaseShopItemIntentと同じ設計）
//
// 【表示件数固定・RemoteViewsServiceを使わない理由】タスク最大4件・買い物最大6件という上限が
// 決まっているため、可変長リスト用のListView/RemoteViewsService（実装コストが高い）を使わず、
// レイアウトXML側に固定で用意したrow_0..3/row_0..5のView群の表示/非表示を切り替えるだけで足りる
package jp.brainbox.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject

class BrainBoxWidgetProvider : AppWidgetProvider() {
    companion object {
        private const val ACTION_TAP_TASK = "jp.brainbox.app.WIDGET_TAP_TASK"
        private const val ACTION_TAP_SHOP = "jp.brainbox.app.WIDGET_TAP_SHOP"
        private const val EXTRA_ID = "id"
        private const val MAX_TASKS = 4
        private const val MAX_SHOP = 6

        // WidgetDataPlugin.updateWidgetData()・タップ受信の両方から呼ばれる、配置済みの全ウィジェット
        // インスタンスを最新データで再描画する共通エントリーポイント
        fun updateAll(context: Context) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, BrainBoxWidgetProvider::class.java))
            if (ids.isEmpty()) return
            val provider = BrainBoxWidgetProvider()
            for (id in ids) provider.updateWidget(context, mgr, id)
        }

        private fun pendingIdSet(prefs: SharedPreferences, key: String): Set<String> {
            return try {
                val arr = JSONArray(prefs.getString(key, "[]") ?: "[]")
                (0 until arr.length()).map { arr.getString(it) }.toSet()
            } catch (e: Exception) {
                emptySet()
            }
        }

        private fun parseItems(prefs: SharedPreferences, jsonKey: String, excluded: Set<String>): List<JSONObject> {
            return try {
                val arr = JSONArray(prefs.getString(jsonKey, "[]") ?: "[]")
                (0 until arr.length()).map { arr.getJSONObject(it) }.filter { !excluded.contains(it.optString("id")) }
            } catch (e: Exception) {
                emptyList()
            }
        }
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) updateWidget(context, appWidgetManager, id)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        val id = intent.getStringExtra(EXTRA_ID) ?: return
        val prefs = context.getSharedPreferences(WidgetDataPlugin.PREFS_NAME, Context.MODE_PRIVATE)
        val key = when (intent.action) {
            ACTION_TAP_TASK -> "pendingCompletedTaskIds"
            ACTION_TAP_SHOP -> "pendingPurchasedShopItemIds"
            else -> return
        }
        val arr = try { JSONArray(prefs.getString(key, "[]") ?: "[]") } catch (e: Exception) { JSONArray() }
        arr.put(id)
        prefs.edit().putString(key, arr.toString()).apply()
        updateAll(context)
    }

    private fun updateWidget(context: Context, mgr: AppWidgetManager, appWidgetId: Int) {
        val prefs = context.getSharedPreferences(WidgetDataPlugin.PREFS_NAME, Context.MODE_PRIVATE)
        val views = RemoteViews(context.packageName, R.layout.widget_combined)

        val themeColor = try {
            Color.parseColor(prefs.getString("widgetThemeColor", "#D9A3B2"))
        } catch (e: Exception) {
            Color.parseColor("#D9A3B2")
        }

        val tasks = parseItems(prefs, "widgetTasksJson", pendingIdSet(prefs, "pendingCompletedTaskIds")).take(MAX_TASKS)
        val shopItems = parseItems(prefs, "widgetShopJson", pendingIdSet(prefs, "pendingPurchasedShopItemIds")).take(MAX_SHOP)

        views.setViewVisibility(R.id.empty_tasks, if (tasks.isEmpty()) View.VISIBLE else View.GONE)
        views.setViewVisibility(R.id.empty_shop, if (shopItems.isEmpty()) View.VISIBLE else View.GONE)

        val taskRowIds = intArrayOf(R.id.task_row_0, R.id.task_row_1, R.id.task_row_2, R.id.task_row_3)
        val taskTimeIds = intArrayOf(R.id.task_time_0, R.id.task_time_1, R.id.task_time_2, R.id.task_time_3)
        val taskNameIds = intArrayOf(R.id.task_name_0, R.id.task_name_1, R.id.task_name_2, R.id.task_name_3)
        val taskDotIds = intArrayOf(R.id.task_dot_0, R.id.task_dot_1, R.id.task_dot_2, R.id.task_dot_3)

        for (i in 0 until MAX_TASKS) {
            if (i < tasks.size) {
                val t = tasks[i]
                views.setViewVisibility(taskRowIds[i], View.VISIBLE)
                views.setTextViewText(taskTimeIds[i], t.optString("time"))
                views.setTextViewText(taskNameIds[i], t.optString("name"))
                views.setInt(taskTimeIds[i], "setTextColor", themeColor)
                views.setInt(taskDotIds[i], "setColorFilter", themeColor)
                val tapIntent = Intent(context, BrainBoxWidgetProvider::class.java).apply {
                    action = ACTION_TAP_TASK
                    putExtra(EXTRA_ID, t.optString("id"))
                }
                val requestCode = appWidgetId * 1000 + i
                val pi = PendingIntent.getBroadcast(context, requestCode, tapIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                views.setOnClickPendingIntent(taskRowIds[i], pi)
            } else {
                views.setViewVisibility(taskRowIds[i], View.GONE)
            }
        }

        val shopRowIds = intArrayOf(R.id.shop_row_0, R.id.shop_row_1, R.id.shop_row_2, R.id.shop_row_3, R.id.shop_row_4, R.id.shop_row_5)
        val shopNameIds = intArrayOf(R.id.shop_name_0, R.id.shop_name_1, R.id.shop_name_2, R.id.shop_name_3, R.id.shop_name_4, R.id.shop_name_5)
        val shopDotIds = intArrayOf(R.id.shop_dot_0, R.id.shop_dot_1, R.id.shop_dot_2, R.id.shop_dot_3, R.id.shop_dot_4, R.id.shop_dot_5)

        for (i in 0 until MAX_SHOP) {
            if (i < shopItems.size) {
                val s = shopItems[i]
                views.setViewVisibility(shopRowIds[i], View.VISIBLE)
                views.setTextViewText(shopNameIds[i], s.optString("name"))
                views.setInt(shopDotIds[i], "setColorFilter", themeColor)
                val tapIntent = Intent(context, BrainBoxWidgetProvider::class.java).apply {
                    action = ACTION_TAP_SHOP
                    putExtra(EXTRA_ID, s.optString("id"))
                }
                val requestCode = appWidgetId * 1000 + 500 + i
                val pi = PendingIntent.getBroadcast(context, requestCode, tapIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                views.setOnClickPendingIntent(shopRowIds[i], pi)
            } else {
                views.setViewVisibility(shopRowIds[i], View.GONE)
            }
        }

        mgr.updateAppWidget(appWidgetId, views)
    }
}

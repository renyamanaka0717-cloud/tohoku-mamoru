// Android Studioで android/app/src/main/java/jp/brainbox/app/ に追加するファイル
// iOS版WidgetDataPlugin.swiftのAndroid移植。プラグイン名をWidgetDataPluginで揃えているため、
// src/app/components/WidgetData.tsは無改修で動く。
//
// 【iOSとの構造的な違い・App Groupが不要】iOSはメインAppとWidget Extensionが別プロセスの
// エクステンションのため、App Group共有のUserDefaultsでデータを受け渡す必要があった。
// AndroidのAppWidgetProviderはデフォルトでメインアプリと同じプロセス内で動作するため、
// 普通のSharedPreferences（PREFS_NAME）をそのまま両方から読み書きするだけで済む
// （App Group相当の追加設定は一切不要）。
package jp.brainbox.app

import android.content.Context
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "WidgetDataPlugin")
class WidgetDataPlugin : Plugin() {
    companion object {
        const val PREFS_NAME = "widget_prefs"
    }

    @PluginMethod
    fun updateWidgetData(call: PluginCall) {
        val tasksJson = call.getString("tasksJson") ?: "[]"
        val shopJson = call.getString("shopJson") ?: "[]"
        val laterJson = call.getString("laterJson") ?: "[]"
        val themeColor = call.getString("themeColor") ?: "#D9A3B2"
        // ウィジェット自体の表示には使わない（固定文言はstrings.xmlのローカライズに任せる）が、
        // GeofenceReceiverが場所通知・忘れ物防止アラートの本文を組み立てる時にアプリの言語設定と
        // 一致させるために保存しておく（iOS版のappLanguageキーと同じ役割）
        val language = call.getString("language") ?: "ja"

        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putString("widgetTasksJson", tasksJson)
            .putString("widgetShopJson", shopJson)
            .putString("widgetLaterJson", laterJson)
            .putString("widgetThemeColor", themeColor)
            .putString("appLanguage", language)
            .apply()

        BrainBoxWidgetProvider.updateAll(context)
        call.resolve()
    }

    @PluginMethod
    fun getPendingWidgetActions(call: PluginCall) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val completedTaskIds = prefs.getString("pendingCompletedTaskIds", "[]") ?: "[]"
        val purchasedShopItemIds = prefs.getString("pendingPurchasedShopItemIds", "[]") ?: "[]"
        prefs.edit()
            .remove("pendingCompletedTaskIds")
            .remove("pendingPurchasedShopItemIds")
            .apply()
        val result = JSObject()
        result.put("completedTaskIds", completedTaskIds)
        result.put("purchasedShopItemIds", purchasedShopItemIds)
        call.resolve(result)
    }
}

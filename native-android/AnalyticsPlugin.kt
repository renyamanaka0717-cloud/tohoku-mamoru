// Android Studioで android/app/src/main/java/jp/brainbox/app/ に追加するファイル
// iOS版AnalyticsPlugin.swiftのAndroid移植。プラグイン名をAnalyticsPluginで揃えているため、
// src/app/components/Analytics.tsは無改修で動く。
//
// logPermissionGrantedOnce()（インストールごとに1回だけの重複防止）はlocalStorageのみで完結する
// JS側ロジックのため、この移植の対象外（ネイティブ側の変更は不要）
package jp.brainbox.app

import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.analytics.ktx.analytics
import com.google.firebase.ktx.Firebase
import org.json.JSONObject

@CapacitorPlugin(name = "AnalyticsPlugin")
class AnalyticsPlugin : Plugin() {
    private val firebaseAnalytics: FirebaseAnalytics by lazy { Firebase.analytics }

    @PluginMethod
    fun logEvent(call: PluginCall) {
        val name = call.getString("name")
        if (name == null) { call.resolve(); return }
        val paramsJson = call.getString("params")
        val bundle = android.os.Bundle()
        if (paramsJson != null) {
            try {
                val obj = JSONObject(paramsJson)
                val keys = obj.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    when (val value = obj.get(key)) {
                        is Boolean -> bundle.putString(key, value.toString())
                        is Int -> bundle.putLong(key, value.toLong())
                        is Long -> bundle.putLong(key, value)
                        is Double -> bundle.putDouble(key, value)
                        else -> bundle.putString(key, value.toString())
                    }
                }
            } catch (e: Exception) {
                // params不正時はイベント名のみで送る
            }
        }
        firebaseAnalytics.logEvent(name, bundle)
        call.resolve()
    }

    @PluginMethod
    fun setUserProperty(call: PluginCall) {
        val name = call.getString("name")
        val value = call.getString("value")
        if (name == null) { call.resolve(); return }
        firebaseAnalytics.setUserProperty(name, value)
        call.resolve()
    }
}

// Android Studioで android/app/src/main/java/jp/brainbox/app/ に追加するファイル
// iOS版GeofencePlugin.swiftのAndroid移植。買い物リストの場所通知・「あとでやる」タスクの場所通知・
// 忘れ物防止アラートの3カテゴリを "shop-"/"task-loc-"/"forget-" prefixで管理する設計はiOS版と同じ。
// registerPlugin('GeofencePlugin')の名前をJS側(Geofence.ts)と揃えているため、JS側は無改修で動く。
//
// 【iOS版との既知の差分】買い物リストの通知本文は、iOS版はWidgetDataPluginが書き込むApp Group共有の
// widgetShopJsonを発火時点に読むが、WidgetDataPluginはAndroid未移植のため、代わりにsetGeofences()の
// 呼び出し時点でJS側(App コンポーネント)から渡される shopItemsJson をそのままSharedPreferencesに
// 保存しておき、発火時にそこから読む設計にしている（Geofence.tsのsetShopGeofences第2引数）。
// WidgetDataPluginをAndroidに移植した後も、この仕組みは変更不要（そのまま両立できる）。
package jp.brainbox.app

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.PermissionState
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingClient
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONArray
import org.json.JSONObject

@CapacitorPlugin(
    name = "GeofencePlugin",
    permissions = [
        Permission(strings = [Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION], alias = "location"),
        Permission(strings = [Manifest.permission.ACCESS_BACKGROUND_LOCATION], alias = "backgroundLocation"),
        Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications"),
    ]
)
class GeofencePlugin : Plugin() {
    companion object {
        const val PREFS_NAME = "geofence_prefs"
        const val SHOP_PREFIX = "shop-"
        const val TASK_PREFIX = "task-loc-"
        const val FORGET_PREFIX = "forget-"
        // 同じ場所への接近で通知を連発しないためのクールダウン（ミリ秒）
        const val NOTIFY_COOLDOWN_MS = 2L * 60 * 60 * 1000
        // 忘れ物防止アラートはGPS境界付近のジッターによる連続発火を防ぐための短いクールダウン（ミリ秒）
        const val FORGET_COOLDOWN_MS = 10L * 60 * 1000
    }

    private val geofencingClient: GeofencingClient by lazy { LocationServices.getGeofencingClient(context) }

    private fun geofencePendingIntent(): PendingIntent {
        val intent = Intent(context, GeofenceReceiver::class.java)
        // Android 12+はジオフェンス用PendingIntentをFLAG_MUTABLEで作らないとIllegalArgumentExceptionになる
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE)
    }

    // ── 権限 ─────────────────────────────────────────────────────────────
    // iOSのrequestAlwaysAuthorization()は1回で「常に許可」まで求められるが、Androidは
    // Android 10+で前景位置情報→バックグラウンド位置情報を別々のダイアログで順に求める必要がある
    // （同時にリクエストするとシステムに拒否される）。通知許可もその後に続けて求める

    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "locationCallback")
        } else {
            requestBackgroundLocationIfNeeded(call)
        }
    }

    @PermissionCallback
    private fun locationCallback(call: PluginCall) {
        requestBackgroundLocationIfNeeded(call)
    }

    private fun requestBackgroundLocationIfNeeded(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            getPermissionState("location") == PermissionState.GRANTED &&
            getPermissionState("backgroundLocation") != PermissionState.GRANTED
        ) {
            requestPermissionForAlias("backgroundLocation", call, "backgroundLocationCallback")
        } else {
            requestNotificationsIfNeeded(call)
        }
    }

    @PermissionCallback
    private fun backgroundLocationCallback(call: PluginCall) {
        requestNotificationsIfNeeded(call)
    }

    private fun requestNotificationsIfNeeded(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            getPermissionState("notifications") != PermissionState.GRANTED
        ) {
            requestPermissionForAlias("notifications", call, "notificationsCallback")
        } else {
            call.resolve(currentStatus())
        }
    }

    @PermissionCallback
    private fun notificationsCallback(call: PluginCall) {
        call.resolve(currentStatus())
    }

    @PluginMethod
    override fun checkPermissions(call: PluginCall) {
        call.resolve(currentStatus())
    }

    private fun currentStatus(): JSObject {
        val obj = JSObject()
        obj.put("location", locationStatus())
        obj.put("notifications", notificationsStatus())
        return obj
    }

    // iOSの .authorizedAlways/.authorizedWhenInUse/.denied/.notDetermined に対応させ、
    // JS側(checkGeofencePermissions)がそのまま読める4値にする
    private fun locationStatus(): String {
        val fine = getPermissionState("location")
        if (fine == PermissionState.DENIED) return "denied"
        if (fine != PermissionState.GRANTED) return "prompt"
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return "granted"
        return if (getPermissionState("backgroundLocation") == PermissionState.GRANTED) "granted" else "limited"
    }

    private fun notificationsStatus(): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return "granted"
        return when (getPermissionState("notifications")) {
            PermissionState.GRANTED -> "granted"
            PermissionState.DENIED -> "denied"
            else -> "prompt"
        }
    }

    private fun hasFineLocation(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    // ── ジオフェンス登録（買い物リスト） ────────────────────────────────────
    // iOSのCLLocationManager.monitoredRegionsに相当する「現在登録済みの一覧を取得するAPI」が
    // GeofencingClientには無いため、SharedPreferencesに自前でIDリストを保存して管理する
    // （LocalNotifyPluginのAlarmManagerと同じ設計）

    @PluginMethod
    fun setGeofences(call: PluginCall) {
        val json = call.getString("locationsJson") ?: "[]"
        val shopItemsJson = call.getString("shopItemsJson") ?: "[]"
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString("shopItemNames", shopItemsJson).apply()

        val entries = try { parseLocationEntries(json) } catch (e: Exception) { call.reject("invalid locationsJson"); return }
        syncGeofenceCategory(SHOP_PREFIX, "shopRegisteredIds", "geofenceNames", entries) { true }
        call.resolve()
    }

    // 「あとでやる」タスクの場所通知。setGeofencesと同じ全解除→再登録方式だが、
    // 発火済み(taskLocationFired_<id>)のエントリはgetFiredTaskLocationIds()で
    // JS側がlocationNotifyをfalseにするまで再登録しない
    @PluginMethod
    fun setTaskLocationGeofences(call: PluginCall) {
        val json = call.getString("locationsJson") ?: "[]"
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val entries = try { parseLocationEntries(json) } catch (e: Exception) { call.reject("invalid locationsJson"); return }
        syncGeofenceCategory(TASK_PREFIX, "taskRegisteredIds", "taskLocationNames", entries) { entry ->
            !prefs.getBoolean("taskLocationFired_${entry.id}", false)
        }
        call.resolve()
    }

    @PluginMethod
    fun getFiredTaskLocationIds(call: PluginCall) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val idsJson = prefs.getString("taskLocationFiredIds", "[]") ?: "[]"
        val ids = mutableListOf<String>()
        try {
            val arr = JSONArray(idsJson)
            for (i in 0 until arr.length()) ids.add(arr.getString(i))
        } catch (e: Exception) { /* 壊れた保存データは無視 */ }
        val editor = prefs.edit()
        for (id in ids) editor.remove("taskLocationFired_$id")
        editor.remove("taskLocationFiredIds")
        editor.apply()
        val obj = JSObject()
        obj.put("ids", JSONArray(ids))
        call.resolve(obj)
    }

    // 忘れ物防止アラート。到着(Enter)・退出(Exit)をエントリごとに選べる点がsetGeofences等と異なる
    @PluginMethod
    fun setForgetAlerts(call: PluginCall) {
        val json = call.getString("alertsJson") ?: "[]"
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val oldIds = storedIds("forgetRegisteredIds")
        if (oldIds.isNotEmpty() && hasFineLocation()) {
            try { geofencingClient.removeGeofences(oldIds) } catch (e: SecurityException) { /* 無視 */ }
        }

        val entries: List<JSONObject>
        try {
            val arr = JSONArray(json)
            entries = (0 until arr.length()).map { arr.getJSONObject(it) }
        } catch (e: Exception) { call.reject("invalid alertsJson"); return }

        val dataDict = JSONObject()
        val newIds = mutableListOf<String>()
        val geofences = mutableListOf<Geofence>()
        for (entry in entries) {
            val id = entry.getString("id")
            val requestId = FORGET_PREFIX + id
            newIds.add(requestId)
            dataDict.put(id, entry)
            val trigger = entry.optString("trigger", "exit")
            val transitionTypes = if (trigger == "enter") Geofence.GEOFENCE_TRANSITION_ENTER else Geofence.GEOFENCE_TRANSITION_EXIT
            geofences.add(
                Geofence.Builder()
                    .setRequestId(requestId)
                    .setCircularRegion(entry.getDouble("lat"), entry.getDouble("lng"), entry.getDouble("radius").toFloat())
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(transitionTypes)
                    .build()
            )
        }
        prefs.edit()
            .putString("forgetRegisteredIds", JSONArray(newIds).toString())
            .putString("forgetAlertData", dataDict.toString())
            .apply()

        if (geofences.isNotEmpty() && hasFineLocation()) {
            val request = GeofencingRequest.Builder().addGeofences(geofences).build()
            try {
                geofencingClient.addGeofences(request, geofencePendingIntent())
            } catch (e: SecurityException) { /* 位置情報権限が無ければ静かにスキップ */ }
        }
        call.resolve()
    }

    private data class LocationEntry(val id: String, val name: String, val lat: Double, val lng: Double, val radius: Double)

    private fun parseLocationEntries(json: String): List<LocationEntry> {
        val arr = JSONArray(json)
        return (0 until arr.length()).map {
            val o = arr.getJSONObject(it)
            LocationEntry(o.getString("id"), o.getString("name"), o.getDouble("lat"), o.getDouble("lng"), o.getDouble("radius"))
        }
    }

    private fun storedIds(key: String): List<String> {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val json = prefs.getString(key, "[]") ?: "[]"
        return try {
            val arr = JSONArray(json)
            (0 until arr.length()).map { arr.getString(it) }
        } catch (e: Exception) { emptyList() }
    }

    // 買い物リスト・タスクの場所通知で共通の「全解除→再登録」処理。includeフィルタは
    // タスクの場所通知だけが使う（発火済みエントリのスキップ）。買い物リストは常にtrue
    private fun syncGeofenceCategory(
        prefix: String, idsKey: String, namesKey: String,
        entries: List<LocationEntry>, include: (LocationEntry) -> Boolean
    ) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val oldIds = storedIds(idsKey)
        if (oldIds.isNotEmpty() && hasFineLocation()) {
            try { geofencingClient.removeGeofences(oldIds) } catch (e: SecurityException) { /* 無視 */ }
        }

        val names = JSONObject()
        val newIds = mutableListOf<String>()
        val geofences = mutableListOf<Geofence>()
        for (entry in entries) {
            if (!include(entry)) continue
            val requestId = prefix + entry.id
            newIds.add(requestId)
            names.put(entry.id, entry.name)
            geofences.add(
                Geofence.Builder()
                    .setRequestId(requestId)
                    .setCircularRegion(entry.lat, entry.lng, entry.radius.toFloat())
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
                    .build()
            )
        }
        prefs.edit()
            .putString(idsKey, JSONArray(newIds).toString())
            .putString(namesKey, names.toString())
            .apply()

        if (geofences.isNotEmpty() && hasFineLocation()) {
            val request = GeofencingRequest.Builder().addGeofences(geofences).build()
            try {
                geofencingClient.addGeofences(request, geofencePendingIntent())
            } catch (e: SecurityException) { /* 位置情報権限が無ければ静かにスキップ */ }
        }
    }

    // ── 通知タップ後の保留アクション ────────────────────────────────────────
    // MainActivityが通知タップ時のIntent extraを見てここと同じSharedPreferencesにフラグを立てる

    @PluginMethod
    fun getPendingGeofenceAction(call: PluginCall) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val shouldOpenShop = prefs.getBoolean("pendingOpenShopList", false)
        val shouldOpenLater = prefs.getBoolean("pendingOpenLaterList", false)
        val notificationOpened = prefs.getBoolean("pendingNotificationOpened", false)
        prefs.edit()
            .remove("pendingOpenShopList")
            .remove("pendingOpenLaterList")
            .remove("pendingNotificationOpened")
            .apply()
        val obj = JSObject()
        obj.put("shouldOpenShop", shouldOpenShop)
        obj.put("shouldOpenLater", shouldOpenLater)
        obj.put("notificationOpened", notificationOpened)
        call.resolve(obj)
    }

    // Androidはアプリから直接、位置情報・通知の許可状態をONにするAPIが無いため、
    // 「アプリ情報」設定画面を直接開くところまでをワンタップで行う（iOS版と同じ役割）
    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", context.packageName, null)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        call.resolve()
    }

    // navigator.geolocationはWKWebView同様WebViewでも不安定なケースがあるため、
    // ネイティブのFusedLocationProviderClientで現在地を一度だけ取得する
    @PluginMethod
    fun getCurrentLocation(call: PluginCall) {
        if (!hasFineLocation()) { call.reject("location permission not granted"); return }
        val fusedClient = LocationServices.getFusedLocationProviderClient(context)
        try {
            val request = CurrentLocationRequest.Builder().setPriority(Priority.PRIORITY_BALANCED_POWER_ACCURACY).build()
            fusedClient.getCurrentLocation(request, null)
                .addOnSuccessListener { loc ->
                    if (loc == null) { call.reject("failed to get location: null"); return@addOnSuccessListener }
                    val obj = JSObject()
                    obj.put("lat", loc.latitude)
                    obj.put("lng", loc.longitude)
                    call.resolve(obj)
                }
                .addOnFailureListener { e -> call.reject("failed to get location: ${e.message}") }
        } catch (e: SecurityException) {
            call.reject("location permission not granted")
        }
    }
}

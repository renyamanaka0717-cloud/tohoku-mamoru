// Android Studioで android/app/src/main/java/jp/brainbox/app/ に追加するファイル
// GeofencingClient.addGeofences()で登録したジオフェンスの境界通過イベントをOSから受け取る。
// iOS版GeofencePlugin.swiftのdidEnterRegion/didExitRegion+handleShopEnter/handleTaskLocationEnter/
// handleForgetAlertFireに相当する処理をすべてここに集約している。
//
// 【appLangの判定方法・WidgetDataPlugin移植により解消済み】WidgetDataPlugin.kt（widget_prefs）が
// tasks/shopItems/themeColor変更のたびに書き込む appLanguage キー（アプリ内で手動選択した言語）を
// 優先して読む。iOS版のApp Group共有UserDefaultsと同じ役割。JSが一度もupdateWidgetData()を
// 呼んでいない場合（インストール直後等）のみ端末のシステムロケール(Locale.getDefault())に
// フォールバックする
package jp.brainbox.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.Locale

class GeofenceReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val event = GeofencingEvent.fromIntent(intent) ?: return
        if (event.hasError()) return
        val transition = event.geofenceTransition
        val triggering = event.triggeringGeofences ?: return

        for (geofence in triggering) {
            val requestId = geofence.requestId
            when {
                requestId.startsWith(GeofencePlugin.TASK_PREFIX) -> {
                    if (transition == Geofence.GEOFENCE_TRANSITION_ENTER) {
                        handleTaskLocationEnter(context, requestId.removePrefix(GeofencePlugin.TASK_PREFIX))
                    }
                }
                requestId.startsWith(GeofencePlugin.FORGET_PREFIX) -> {
                    val alertId = requestId.removePrefix(GeofencePlugin.FORGET_PREFIX)
                    if (transition == Geofence.GEOFENCE_TRANSITION_ENTER) handleForgetAlertFire(context, alertId, true)
                    else if (transition == Geofence.GEOFENCE_TRANSITION_EXIT) handleForgetAlertFire(context, alertId, false)
                }
                requestId.startsWith(GeofencePlugin.SHOP_PREFIX) -> {
                    if (transition == Geofence.GEOFENCE_TRANSITION_ENTER) {
                        handleShopEnter(context, requestId.removePrefix(GeofencePlugin.SHOP_PREFIX))
                    }
                }
            }
        }
    }

    private fun prefs(context: Context) =
        context.getSharedPreferences(GeofencePlugin.PREFS_NAME, Context.MODE_PRIVATE)

    // 端末のローカルカレンダー日付を"YYYY-MM-DD"で返す。JS側のTask.date（dateToStr()）と
    // 同じ形式（ローカル日付、UTCではない）にそろえる
    private fun todayDateString(): String {
        val cal = Calendar.getInstance()
        return String.format(Locale.US, "%04d-%02d-%02d", cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH))
    }

    private fun handleShopEnter(context: Context, locId: String) {
        val prefs = prefs(context)
        val cooldownKey = "geofenceLastNotified_$locId"
        val now = System.currentTimeMillis()
        val last = prefs.getLong(cooldownKey, 0L)
        if (now - last < GeofencePlugin.NOTIFY_COOLDOWN_MS) return

        val itemNames = try {
            val arr = JSONArray(prefs.getString("shopItemNames", "[]") ?: "[]")
            (0 until arr.length()).map { arr.getString(it) }
        } catch (e: Exception) { emptyList() }
        if (itemNames.isEmpty()) return

        prefs.edit().putLong(cooldownKey, now).apply()

        val lang = appLang(context)
        var placeName = placeNamePlaceholder(lang)
        try {
            val names = JSONObject(prefs.getString("geofenceNames", "{}") ?: "{}")
            if (names.has(locId)) placeName = names.getString(locId)
        } catch (e: Exception) { /* 無視 */ }

        val separator = if (lang == "ja" || lang == "zh-TW") "、" else ", "
        val shownNames = itemNames.take(5).joinToString(separator)
        val body = if (itemNames.size > 5) moreItemsSuffix(lang, shownNames, itemNames.size - 5) else shownNames

        val (title, fullBody) = shopNotificationText(lang, placeName, body)
        val notifId = ("shop-geofence-$locId-$now").hashCode()
        BrainBoxNotifications.show(context, notifId, title, fullBody, openShop = true)
    }

    // 「あとでやる」タスクの場所通知。時間通知(task-alert-)とは独立して動作し、発火してもお互いを
    // 解除しない。
    // ・「あとでやる」タスク（taskLocationDatesにエントリが無い）: 1日1回を上限に毎日発火し続ける
    // ・時間指定タスクになった後（date付き）: そのdateと今日が一致する日だけ発火する
    // どちらの場合もジオフェンス自体は解除しない（翌日以降も判定を続ける必要があるため）
    private fun handleTaskLocationEnter(context: Context, taskId: String) {
        val prefs = prefs(context)
        val today = todayDateString()

        val targetDate = try {
            val dates = JSONObject(prefs.getString("taskLocationDates", "{}") ?: "{}")
            if (dates.has(taskId)) dates.getString(taskId) else null
        } catch (e: Exception) { null }
        if (targetDate != null && targetDate != today) return

        val lastKey = "taskLocationLastNotified_$taskId"
        if (prefs.getString(lastKey, null) == today) return
        prefs.edit().putString(lastKey, today).apply()

        val firedIds = try {
            val arr = JSONArray(prefs.getString("taskLocationFiredIds", "[]") ?: "[]")
            (0 until arr.length()).map { arr.getString(it) }.toMutableList()
        } catch (e: Exception) { mutableListOf() }
        firedIds.add(taskId)
        prefs.edit().putString("taskLocationFiredIds", JSONArray(firedIds).toString()).apply()

        val lang = appLang(context)
        var taskName = defaultTaskName(lang)
        try {
            val names = JSONObject(prefs.getString("taskLocationNames", "{}") ?: "{}")
            if (names.has(taskId)) taskName = names.getString(taskId)
        } catch (e: Exception) { /* 無視 */ }

        val body = arrivedBodyText(lang)
        val notifId = ("task-loc-fire-$taskId-${System.currentTimeMillis()}").hashCode()
        BrainBoxNotifications.show(context, notifId, taskName, body, openShop = false, openLater = true)
    }

    // 忘れ物防止アラート。到着(Enter)/退出(Exit)いずれかをトリガーに選べる。条件を満たすたびに
    // 毎回発火し得る（タスクの場所通知と違い1回きりではない）ため、GPS境界付近のジッターによる
    // 連続発火だけをクールダウンで防ぐ。曜日・時間帯は発火時点の現在時刻で判定する
    private fun handleForgetAlertFire(context: Context, alertId: String, isEnter: Boolean) {
        val prefs = prefs(context)
        val cooldownKey = "forgetAlertLastNotified_$alertId"
        val now = System.currentTimeMillis()
        val last = prefs.getLong(cooldownKey, 0L)
        if (now - last < GeofencePlugin.FORGET_COOLDOWN_MS) return

        val entry = try {
            val dict = JSONObject(prefs.getString("forgetAlertData", "{}") ?: "{}")
            if (dict.has(alertId)) dict.getJSONObject(alertId) else null
        } catch (e: Exception) { null } ?: return

        val calendar = Calendar.getInstance()
        // CalendarのDAY_OF_WEEKはSunday=1...Saturday=7。JS側は0=日...6=土なので-1でそろえる
        val weekdayIdx = calendar.get(Calendar.DAY_OF_WEEK) - 1
        val weekdays = try {
            val arr = entry.getJSONArray("weekdays")
            (0 until arr.length()).map { arr.getInt(it) }
        } catch (e: Exception) { emptyList() }
        if (!weekdays.contains(weekdayIdx)) return

        val timeStart = entry.optString("timeStart", "")
        val timeEnd = entry.optString("timeEnd", "")
        if (timeStart.isNotEmpty() && timeEnd.isNotEmpty()) {
            val nowMinutes = calendar.get(Calendar.HOUR_OF_DAY) * 60 + calendar.get(Calendar.MINUTE)
            val startMinutes = minutesFromTimeString(timeStart) ?: return
            val endMinutes = minutesFromTimeString(timeEnd) ?: return
            val inWindow = if (startMinutes <= endMinutes) {
                nowMinutes in startMinutes until endMinutes
            } else {
                // 日をまたぐ時間帯（例: 22:00〜2:00）
                nowMinutes >= startMinutes || nowMinutes < endMinutes
            }
            if (!inWindow) return
        }

        prefs.edit().putLong(cooldownKey, now).apply()

        val lang = appLang(context)
        val name = entry.optString("name", "")
        val items = try {
            val arr = entry.getJSONArray("items")
            (0 until arr.length()).map { arr.getString(it) }
        } catch (e: Exception) { emptyList() }

        val (title, body) = forgetAlertText(lang, name, items, isEnter)
        val notifId = ("forget-fire-$alertId-$now").hashCode()
        BrainBoxNotifications.show(context, notifId, title, body, openShop = false)
    }

    private fun minutesFromTimeString(s: String): Int? {
        val parts = s.split(":")
        if (parts.size != 2) return null
        val h = parts[0].toIntOrNull() ?: return null
        val m = parts[1].toIntOrNull() ?: return null
        return h * 60 + m
    }

    // WidgetDataPluginのAndroid移植により、iOS版と同じappLanguageキー（widget_prefsに保存、
    // WidgetDataPlugin.updateWidgetData()がtasks/shopItems/themeColor変更のたびに書き込む）を
    // 優先して読む。JSが一度もupdateWidgetData()を呼んでいない場合（インストール直後等）のみ
    // 端末のシステムロケールにフォールバックする（JSのdetectLanguage()と同じ優先順位：
    // ja→ko→zh→es→pt→vi→th→idの次にen）
    private fun appLang(context: Context): String {
        val stored = context.getSharedPreferences(WidgetDataPlugin.PREFS_NAME, Context.MODE_PRIVATE)
            .getString("appLanguage", null)
        if (stored != null) return stored
        val locale = Locale.getDefault()
        val lang = locale.language
        val country = locale.country
        return when {
            lang == "ja" -> "ja"
            lang == "ko" -> "ko"
            lang == "zh" -> "zh-TW" // 簡体字非対応のため繁体字にフォールバック
            lang == "es" -> "es"
            lang == "pt" -> "pt"
            lang == "vi" -> "vi"
            lang == "th" -> "th"
            lang == "id" -> "id"
            else -> "en"
        }
    }

    private fun placeNamePlaceholder(lang: String) = when (lang) {
        "ja" -> "登録した場所"
        "ko" -> "저장된 장소"
        "zh-TW" -> "已儲存的地點"
        "es" -> "un lugar guardado"
        "pt" -> "um lugar salvo"
        "vi" -> "một địa điểm đã lưu"
        "th" -> "สถานที่ที่บันทึกไว้"
        "id" -> "lokasi yang tersimpan"
        else -> "a saved place"
    }

    private fun moreItemsSuffix(lang: String, names: String, more: Int): String = when (lang) {
        "ja" -> "$names 他${more}件"
        "ko" -> "$names 외 ${more}개"
        "zh-TW" -> "$names 等${more}項"
        "es" -> "$names y $more más"
        "pt" -> "$names e mais $more"
        "vi" -> "$names và $more mục khác"
        "th" -> "$names และอีก $more รายการ"
        "id" -> "$names dan $more lainnya"
        else -> "$names and $more more"
    }

    private fun shopNotificationText(lang: String, placeName: String, body: String): Pair<String, String> = when (lang) {
        "ja" -> "${placeName}の近くです" to "買い物リスト: $body"
        "ko" -> "$placeName 근처예요" to "쇼핑 목록: $body"
        "zh-TW" -> "在${placeName}附近" to "購物清單：$body"
        "es" -> "Cerca de $placeName" to "Lista de compras: $body"
        "pt" -> "Perto de $placeName" to "Lista de compras: $body"
        "vi" -> "Gần $placeName" to "Danh sách mua sắm: $body"
        "th" -> "อยู่ใกล้ $placeName" to "รายการซื้อของ: $body"
        "id" -> "Dekat $placeName" to "Daftar belanja: $body"
        else -> "Near $placeName" to "Shopping list: $body"
    }

    private fun defaultTaskName(lang: String) = when (lang) {
        "ja" -> "あとでやるタスク"
        "ko" -> "나중에 할 일"
        "zh-TW" -> "稍後辦任務"
        "es" -> "Tarea de Más tarde"
        "pt" -> "Tarefa de Mais tarde"
        "vi" -> "Công việc Để sau"
        "th" -> "งานไว้ทีหลัง"
        "id" -> "Tugas Nanti"
        else -> "Later task"
    }

    private fun arrivedBodyText(lang: String) = when (lang) {
        "ja" -> "この場所に着きました。"
        "ko" -> "이 장소에 도착했어요."
        "zh-TW" -> "您已抵達此地點。"
        "es" -> "Llegaste a este lugar."
        "pt" -> "Você chegou a este lugar."
        "vi" -> "Bạn đã đến địa điểm này."
        "th" -> "คุณมาถึงสถานที่นี้แล้ว"
        "id" -> "Anda telah tiba di lokasi ini."
        else -> "You've arrived at this location."
    }

    private fun forgetAlertText(lang: String, name: String, items: List<String>, isEnter: Boolean): Pair<String, String> {
        if (isEnter) {
            return when (lang) {
                "ja" -> "${name}に着きました" to (if (items.isEmpty()) "確認することはありませんか？" else "${items.joinToString("、")}を確認しましょう。")
                "ko" -> "$name 에 도착했어요" to (if (items.isEmpty()) "확인할 것이 있나요?" else "${items.joinToString(", ")}을(를) 확인하세요.")
                "zh-TW" -> "已抵達$name" to (if (items.isEmpty()) "有什麼需要確認的嗎？" else "請確認${items.joinToString("、")}。")
                "es" -> "Llegaste a $name" to (if (items.isEmpty()) "¿Algo que revisar?" else "Revisa: ${items.joinToString(", ")}.")
                "pt" -> "Você chegou a $name" to (if (items.isEmpty()) "Tem algo para conferir?" else "Confira: ${items.joinToString(", ")}.")
                "vi" -> "Bạn đã đến $name" to (if (items.isEmpty()) "Có gì cần kiểm tra không?" else "Kiểm tra: ${items.joinToString(", ")}.")
                "th" -> "มาถึง $name แล้ว" to (if (items.isEmpty()) "มีอะไรต้องตรวจสอบไหม" else "ตรวจสอบ: ${items.joinToString(", ")}")
                "id" -> "Tiba di $name" to (if (items.isEmpty()) "Ada yang perlu diperiksa?" else "Periksa: ${items.joinToString(", ")}.")
                else -> "Arrived at $name" to (if (items.isEmpty()) "Anything to check?" else "Check: ${items.joinToString(", ")}.")
            }
        }
        return when (lang) {
            "ja" -> "${name}を出ました" to (if (items.isEmpty()) "忘れ物はありませんか？" else "${items.joinToString("、")}を持ちましたか？")
            "ko" -> "$name 에서 나왔어요" to (if (items.isEmpty()) "놓고 온 것은 없나요?" else "${items.joinToString(", ")}을(를) 챙기셨나요?")
            "zh-TW" -> "已離開$name" to (if (items.isEmpty()) "有沒有忘記帶東西？" else "你帶了${items.joinToString("、")}嗎？")
            "es" -> "Saliste de $name" to (if (items.isEmpty()) "¿Olvidaste algo?" else "¿Llevas contigo: ${items.joinToString(", ")}?")
            "pt" -> "Você saiu de $name" to (if (items.isEmpty()) "Esqueceu de algo?" else "Você está levando: ${items.joinToString(", ")}?")
            "vi" -> "Bạn đã rời khỏi $name" to (if (items.isEmpty()) "Bạn có quên gì không?" else "Bạn đã mang theo: ${items.joinToString(", ")}?")
            "th" -> "ออกจาก $name แล้ว" to (if (items.isEmpty()) "ลืมอะไรหรือเปล่า" else "คุณพกพา ${items.joinToString(", ")} มาหรือยัง")
            "id" -> "Meninggalkan $name" to (if (items.isEmpty()) "Ada yang lupa dibawa?" else "Apakah Anda membawa: ${items.joinToString(", ")}?")
            else -> "Left $name" to (if (items.isEmpty()) "Forgot anything?" else "Do you have: ${items.joinToString(", ")}?")
        }
    }

}

// Android Studioで android/app/src/main/java/jp/brainbox/app/ に追加するファイル
// iOS版VoiceInputPlugin.swiftのAndroid移植。プラグイン名をVoiceInputPluginで揃えているため、
// src/app/components/VoiceInput.tsは無改修で動く。
//
// 【iOSとの違い】iOSはAVAudioEngineで生の音声バッファを自前で処理し、RMS音量計算から
// 無音タイマーまで全て手動実装している。Androidの android.speech.SpeechRecognizer は
// 部分認識結果(onPartialResults)・音量(onRmsChanged)・エラー(onError)をOS側が既にコールバック
// で提供するため、iOS版よりシンプルに実装できる。ただし「無音が続いたら自動終了する」判定は
// OS標準のSpeechRecognizer任せにせず、iOS版と同じくonPartialResultsのたびに独自タイマーを
// リセットする方式にした（EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS等はヒントに過ぎず
// 端末・認識サービスによって挙動が揺れるため、自前タイマーの方が確実に1.3秒で統一できる）。
//
// Androidには「音声認識」専用の許可ダイアログが無い（マイク権限のみ）。speechRecognitionの
// 許可状態は、代わりにSpeechRecognizer.isRecognitionAvailable()（端末が認識サービスに
// 対応しているか）で判定する
package jp.brainbox.app

import android.Manifest
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

@CapacitorPlugin(
    name = "VoiceInputPlugin",
    permissions = [Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone")]
)
class VoiceInputPlugin : Plugin(), RecognitionListener {
    companion object {
        // iOS版のsilenceTimeoutと同じ、無音がこの時間続いたら自動的に認識を終了する
        private const val SILENCE_TIMEOUT_MS = 1300L
        // iOS版のlevelNotifyIntervalと同じ、波形通知の間引き間隔
        private const val LEVEL_NOTIFY_INTERVAL_MS = 80L
        // 直近の最大音量（緩やかに減衰）を基準にした相対値で正規化する。固定閾値だと機種や
        // 周辺環境によって波形がほとんど動かないことがあるため（iOS版と同じ理由）
        private const val PEAK_DECAY = 0.985f
        private const val PEAK_FLOOR = 0.6f
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var speechRecognizer: SpeechRecognizer? = null
    private var finalText: String = ""
    private var finished = true
    private var peakLevel = PEAK_FLOOR
    private var lastLevelNotifyMs = 0L
    private val silenceRunnable = Runnable { finishRecognition() }

    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "micPermsCallback")
        } else {
            resolvePermissions(call)
        }
    }

    @PermissionCallback
    private fun micPermsCallback(call: PluginCall) {
        resolvePermissions(call)
    }

    @PluginMethod
    override fun checkPermissions(call: PluginCall) {
        resolvePermissions(call)
    }

    private fun resolvePermissions(call: PluginCall) {
        val result = JSObject()
        result.put("microphone", if (getPermissionState("microphone") == PermissionState.GRANTED) "granted" else "denied")
        result.put("speechRecognition", if (SpeechRecognizer.isRecognitionAvailable(context)) "granted" else "denied")
        call.resolve(result)
    }

    @PluginMethod
    fun start(call: PluginCall) {
        val locale = call.getString("locale") ?: "ja-JP"
        mainHandler.post {
            cancelActive()
            if (!SpeechRecognizer.isRecognitionAvailable(context)) {
                call.reject("recognizer_unavailable")
                return@post
            }
            finalText = ""
            finished = false
            peakLevel = PEAK_FLOOR
            lastLevelNotifyMs = 0L

            val recognizer = SpeechRecognizer.createSpeechRecognizer(context)
            recognizer.setRecognitionListener(this)
            speechRecognizer = recognizer

            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
            }
            recognizer.startListening(intent)
            call.resolve()
        }
    }

    // ユーザーが無音を待たず早めに切り上げたい場合の手動停止。stopListening()はここまでの
    // 音声で認識を確定させ、onResults経由でfinishRecognition()が呼ばれる（iOS版のfinishRecognition()
    // と同じく、実際のテキストは常にnotifyListenersの単一経路から届く。stop自体は即resolve）
    @PluginMethod
    fun stop(call: PluginCall) {
        mainHandler.post { speechRecognizer?.stopListening() }
        call.resolve()
    }

    // ── RecognitionListener ──────────────────────────────────────────────
    override fun onReadyForSpeech(params: Bundle?) {}
    override fun onBeginningOfSpeech() {}
    override fun onEndOfSpeech() {}
    override fun onEvent(eventType: Int, params: Bundle?) {}
    override fun onBufferReceived(buffer: ByteArray?) {}

    override fun onRmsChanged(rmsdB: Float) {
        val value = if (rmsdB.isNaN()) 0f else rmsdB.coerceAtLeast(0f)
        peakLevel = maxOf(value, peakLevel * PEAK_DECAY)
        val effectivePeak = maxOf(peakLevel, PEAK_FLOOR)
        val level = (value / effectivePeak).coerceIn(0f, 1f)

        val now = System.currentTimeMillis()
        if (now - lastLevelNotifyMs < LEVEL_NOTIFY_INTERVAL_MS) return
        lastLevelNotifyMs = now
        val data = JSObject()
        data.put("level", level.toDouble())
        notifyListeners("audioLevel", data)
    }

    override fun onPartialResults(partialResults: Bundle?) {
        partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { finalText = it }
        resetSilenceTimer()
    }

    override fun onResults(results: Bundle?) {
        results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { finalText = it }
        finishRecognition()
    }

    override fun onError(error: Int) {
        // 無音のまま何も認識されなかった場合(ERROR_NO_MATCH/ERROR_SPEECH_TIMEOUT等)もここに来る。
        // それまでの部分認識結果(finalText)を使ってそのまま終了する
        finishRecognition()
    }

    private fun resetSilenceTimer() {
        mainHandler.removeCallbacks(silenceRunnable)
        mainHandler.postDelayed(silenceRunnable, SILENCE_TIMEOUT_MS)
    }

    // 無音検知・onResults・onError・手動stop()のいずれかから呼ばれる、認識終了の唯一の経路
    private fun finishRecognition() {
        if (finished) return
        finished = true
        mainHandler.removeCallbacks(silenceRunnable)
        speechRecognizer?.setRecognitionListener(null)
        speechRecognizer?.destroy()
        speechRecognizer = null
        val levelData = JSObject()
        levelData.put("level", 0)
        notifyListeners("audioLevel", levelData)
        val data = JSObject()
        data.put("text", finalText)
        notifyListeners("recognitionFinished", data)
    }

    // start()が録音中に再度呼ばれた場合の後始末。finishRecognition()と違い前回ぶんの
    // イベントを二重送信しないようnotifyListenersを呼ばない
    private fun cancelActive() {
        if (finished) return
        finished = true
        mainHandler.removeCallbacks(silenceRunnable)
        speechRecognizer?.setRecognitionListener(null)
        speechRecognizer?.destroy()
        speechRecognizer = null
    }
}

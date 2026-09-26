// Xcodeで ios/App/App/ に追加するファイル（Target: App）
import Capacitor
import Speech
import AVFoundation

// タスク名入力欄の音声入力（PRO機能）。無音を検知したら自動的に認識を終了し、
// notifyListeners("recognitionFinished")でテキストを1回だけ通知するシンプルな設計。
// ライブの部分認識結果はJS側には逐次配信しない（ネイティブ内部でのみ蓄積する）
@objc(VoiceInputPlugin)
public class VoiceInputPlugin: CAPPlugin {
    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var finalText: String = ""
    private var silenceTimer: Timer?
    // 無音がこの秒数続いたら自動的に認識を終了する
    private static let silenceTimeout: TimeInterval = 1.3

    @objc public override func requestPermissions(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { speechStatus in
            AVAudioSession.sharedInstance().requestRecordPermission { micGranted in
                DispatchQueue.main.async {
                    call.resolve([
                        "speechRecognition": speechStatus == .authorized ? "granted" : "denied",
                        "microphone": micGranted ? "granted" : "denied",
                    ])
                }
            }
        }
    }

    @objc public override func checkPermissions(_ call: CAPPluginCall) {
        let speechStatus = SFSpeechRecognizer.authorizationStatus()
        let micStatus = AVAudioSession.sharedInstance().recordPermission
        call.resolve([
            "speechRecognition": speechStatus == .authorized ? "granted" : (speechStatus == .notDetermined ? "prompt" : "denied"),
            "microphone": micStatus == .granted ? "granted" : (micStatus == .undetermined ? "prompt" : "denied"),
        ])
    }

    @objc func start(_ call: CAPPluginCall) {
        cancelActive()
        finalText = ""
        let localeId = call.getString("locale") ?? "ja-JP"
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeId)), recognizer.isAvailable else {
            call.reject("recognizer_unavailable")
            return
        }

        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            call.reject("audio_session_error")
            return
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        recognitionRequest = request

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self = self else { return }
            if let result = result {
                self.finalText = result.bestTranscription.formattedString
                self.resetSilenceTimer()
                if result.isFinal {
                    self.finishRecognition()
                }
            }
            if error != nil {
                self.finishRecognition()
            }
        }

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
            request.append(buffer)
        }

        audioEngine.prepare()
        do {
            try audioEngine.start()
            call.resolve()
        } catch {
            call.reject("audio_engine_error")
        }
    }

    // ユーザーが無音を待たず早めに切り上げたい場合の手動停止。実際のテキストは自動終了と
    // 同じfinishRecognition()経由でnotifyListenersイベントとして届く（stop自体は即resolve）
    @objc func stop(_ call: CAPPluginCall) {
        finishRecognition()
        call.resolve()
    }

    private func resetSilenceTimer() {
        silenceTimer?.invalidate()
        silenceTimer = Timer.scheduledTimer(withTimeInterval: Self.silenceTimeout, repeats: false) { [weak self] _ in
            self?.finishRecognition()
        }
    }

    // 無音検知・isFinal結果・手動停止のいずれかから呼ばれる、認識終了の唯一の経路
    private func finishRecognition() {
        guard recognitionTask != nil else { return }
        silenceTimer?.invalidate()
        silenceTimer = nil
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionRequest = nil
        recognitionTask = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        notifyListeners("recognitionFinished", data: ["text": finalText])
    }

    // start()が録音中に再度呼ばれた場合の後始末。こちらはfinishRecognition()と違い
    // 前回ぶんのイベントを二重送信しないよう notifyListeners を呼ばない
    private func cancelActive() {
        silenceTimer?.invalidate()
        silenceTimer = nil
        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        recognitionRequest?.endAudio()
        recognitionTask?.cancel()
        recognitionRequest = nil
        recognitionTask = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

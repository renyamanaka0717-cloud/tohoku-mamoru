// Xcodeで ios/App/App/ に追加するファイル（Target: App）
import Capacitor
import Speech
import AVFoundation

// タスク名入力欄の音声入力（PRO機能）。ライブの部分認識結果は逐次返さず、
// start()で録音開始→stop()で録音停止と同時に確定テキストをまとめて返す
// シンプルな設計にしている（notifyListenersでのストリーミングは行わない）。
@objc(VoiceInputPlugin)
public class VoiceInputPlugin: CAPPlugin {
    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var finalText: String = ""

    @objc func requestPermissions(_ call: CAPPluginCall) {
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

    @objc func checkPermissions(_ call: CAPPluginCall) {
        let speechStatus = SFSpeechRecognizer.authorizationStatus()
        let micStatus = AVAudioSession.sharedInstance().recordPermission
        call.resolve([
            "speechRecognition": speechStatus == .authorized ? "granted" : (speechStatus == .notDetermined ? "prompt" : "denied"),
            "microphone": micStatus == .granted ? "granted" : (micStatus == .undetermined ? "prompt" : "denied"),
        ])
    }

    @objc func start(_ call: CAPPluginCall) {
        stopEngine()
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
            }
            if error != nil {
                self.stopEngine()
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

    @objc func stop(_ call: CAPPluginCall) {
        stopEngine()
        call.resolve(["text": finalText])
    }

    private func stopEngine() {
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

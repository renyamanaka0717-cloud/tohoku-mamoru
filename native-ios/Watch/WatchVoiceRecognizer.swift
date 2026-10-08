// Xcodeで新規作成する「Watch App」ターゲットに追加するファイル（Target: BrainBox Watch App）
//
// ContentView.swiftが使う自前の音声認識。以前はWatchKitのpresentTextInputController
// （システム標準の入力選択画面）を使っていたが、「候補チップ/Scribble選択を完全にスキップ
// できない」というAPIの制約上、アプリを開くたびに手書き（Scribble）の画面が先に出てしまい、
// 「開いた瞬間にダイクテーションが始まる」という狙った体験を実現できなかった（実機で確認済み）。
// そのため、iOS版VoiceInputPlugin.swiftと同じ方式（SFSpeechRecognizer + AVAudioEngineの
// 自前実装）に作り変えた。この方式ではシステムの入力選択画面を経由しないため、Watch App側の
// Info.plistに NSMicrophoneUsageDescription / NSSpeechRecognitionUsageDescription の追加が
// 必要（Xcodeの対象ターゲット → Info タブ → Custom watchOS Target Propertiesで追加する。
// 旧実装のコメントにあった「Info.plist追加不要」はこの作り変えにより当てはまらなくなった）。
import Foundation
import Speech
import AVFoundation

final class WatchVoiceRecognizer: NSObject, ObservableObject {
    @Published var isRecording = false

    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private var silenceTimer: Timer?
    private var finishTimeoutTimer: Timer?
    private let silenceTimeout: TimeInterval = 1.3
    private var latestText = ""
    private var finished = false
    private var onFinish: ((String) -> Void)?

    func requestAuthorization(_ completion: @escaping (Bool) -> Void) {
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else {
                DispatchQueue.main.async { completion(false) }
                return
            }
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                DispatchQueue.main.async { completion(granted) }
            }
        }
    }

    func start(onFinish: @escaping (String) -> Void) {
        self.onFinish = onFinish
        finished = false
        latestText = ""

        guard let recognizer = SFSpeechRecognizer(locale: Locale.current), recognizer.isAvailable else {
            finish(nil)
            return
        }

        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            finish(nil)
            return
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        recognitionRequest = request

        let inputNode = audioEngine.inputNode
        let format = inputNode.outputFormat(forBus: 0)
        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
        }

        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            finish(nil)
            return
        }
        isRecording = true

        recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            if let result {
                self.latestText = result.bestTranscription.formattedString
                self.resetSilenceTimer()
                if result.isFinal {
                    self.finish(self.latestText)
                }
            }
            if error != nil {
                self.finish(self.latestText)
            }
        }
    }

    // 部分認識結果が届くたびにタイマーをリセットし、無音がsilenceTimeout続いたら自動終了する
    // （iOS版VoiceInputPluginと同じ方式）
    private func resetSilenceTimer() {
        silenceTimer?.invalidate()
        silenceTimer = Timer.scheduledTimer(withTimeInterval: silenceTimeout, repeats: false) { [weak self] _ in
            self?.endAudioAndWaitForFinal()
        }
    }

    // 手動での早期終了（もう一度マイクをタップした場合）。無音タイムアウトと同じ経路を使う
    func stop() {
        guard isRecording, !finished else { return }
        silenceTimer?.invalidate()
        endAudioAndWaitForFinal()
    }

    // endAudio()の直後にrecognitionTask.cancel()で即座に打ち切ると、特に短い発話で
    // 最終結果が届く前にテキストが空になる不具合がある（iOS版VoiceInputPluginと同じ罠）ため、
    // ここではendAudio()を呼んでrecognitionTaskのisFinal結果を待つ。万一結果が来ない場合に
    // 備え、保険のタイムアウトで強制終了する
    private func endAudioAndWaitForFinal() {
        recognitionRequest?.endAudio()
        finishTimeoutTimer?.invalidate()
        finishTimeoutTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: false) { [weak self] _ in
            guard let self else { return }
            self.finish(self.latestText)
        }
    }

    private func finish(_ text: String?) {
        guard !finished else { return }
        finished = true
        silenceTimer?.invalidate(); silenceTimer = nil
        finishTimeoutTimer?.invalidate(); finishTimeoutTimer = nil
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        let result = text ?? latestText
        DispatchQueue.main.async { [weak self] in
            self?.isRecording = false
            self?.onFinish?(result)
        }
    }
}

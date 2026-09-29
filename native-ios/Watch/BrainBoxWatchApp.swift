// Xcodeで新規作成する「Watch App」ターゲットに追加するファイル（Target: BrainBox Watch App）
// このターゲットはiOSアプリ（Capacitor/WKWebView）とは完全に別物のネイティブSwiftUIアプリ。
// v1スコープは「音声入力→あとでやるに追加」のみに絞り、日時設定・所要時間設定は一切持たない
import SwiftUI

@main
struct BrainBoxWatchApp: App {
    @StateObject private var connector = WatchConnector()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(connector)
        }
    }
}

---
name: brainbox-feature
description: Use when designing or implementing a new BrainBox feature or any non-trivial change to existing behavior (new Task field, new notification type, new screen, new Capacitor plugin, data model change). Drives a research-before-code workflow — find existing patterns, check iOS/Android/Web impact, confirm data compatibility, and flag large changes before writing code — matching BrainBox's single-file architecture and localStorage-only persistence model.
---

# BrainBox 新機能・変更実装スキル

BrainBoxは **Next.js 15 / TypeScript / Capacitor v8** の個人開発アプリ。サーバーDBなし・`localStorage`完結が基本方針（ログイン機能のみ例外でFirestoreも使う）。実装前の調査を省略しない。

## 実装前に必ず行うこと

1. **推測で書かない。** `Grep`/`Read` で現在の実装を確認してから変更する。「こうなっているはず」で進めない。
2. **関連する型・定数・既存useEffectを洗い出す。** 特に通知系は `syncTaskAlerts`/`GeofencePlugin`/`InactivityPlugin` など複数の既存パターンがあるため、似た機能を grep してから倣う。
3. **影響範囲を3プラットフォームで考える**: Web（ブラウザ・開発環境）／iOSネイティブ（`native-ios/`、Capacitorプラグイン）／Androidネイティブ（`native-android/`）。機能によっては3つとも対応が要るか、Webのみで足りるかを最初に判断する。
4. **大きな変更・設計判断が要る変更は実装前にユーザーに確認する。** 新しい抽象化・新しいlocalStorageキー・新しいCapacitorプラグインを増やす前に、既存の仕組みで足りないか検討する。

## このリポジトリ固有の設計原則

- **1ファイル集約が意図的** (`src/app/page.tsx`)。安易なコンポーネント分割・リファクタリングをしない。必要最小限の変更のみ。
- **データはlocalStorage。** 新しい永続データは原則 `localStorage`（キーは `tl-xxx-v1` 形式、型は page.tsx 内に定義）。サーバーAPI・新しいバックエンドを増やさない（ログイン/クラウド同期機能のみ例外でFirestore使用、既存の `Cloud.ts` パターンに倣う）。
- **通知はすべて `notify()`（`src/app/components/LocalNotify.ts`）経由。** `new Notification(...)` を直接呼ばない（WKWebViewで無音失敗する）。
  - フォアグラウンドのみでよい通知: 既存の `now` ポーリング `useEffect` パターンに倣う。
  - バックグラウンド/未起動でも発火が必要な通知: `syncTaskAlerts`/`GeofencePlugin`/`InactivityPlugin` と同じ「JS側で事前計算→ネイティブに事前予約（`UNTimeIntervalNotificationTrigger`/`UNCalendarNotificationTrigger`/`CLCircularRegion`、Android側は `AlarmManager`/`GeofencingClient`）」方式が必須。
- **ネイティブ機能はCapacitorカスタムプラグインの「JS薄いラッパー→ネイティブプラグイン」構成。** 新しいプラグインを追加する時は `native-ios/XxxPlugin.swift/.m` と `native-android/XxxPlugin.kt` を同じプラグイン名（`@CapacitorPlugin(name:)`/`@objc`）で揃え、JS側 (`src/app/components/Xxx.ts`) は `registerPlugin` の名前だけに依存させる（無改修でプラットフォーム間共有できる設計）。
- **新規iOSプラグインは `BridgeViewController.swift` の `capacitorDidLoad()` に `registerPluginInstance(...)` を追加しないと動かない。** ファイルをXcodeに追加しただけでは機能しない（過去に実機不具合として実際に発生）。Androidは `MainActivity.java` の `registerPlugin(...)` が対応物。
- **「保留アクション」設計**（ウィジェット・ジオフェンス・Watch連携などバックグラウンドで起きたイベント）: ネイティブはUserDefaults/SharedPreferencesのキューに貯めるだけにし、`notifyListeners` でのライブ配信はしない（WebViewが読み込まれていない可能性があるため）。JS側がフォアグラウンド復帰時（`visibilitychange`・起動時）にポーリングして読み出す。新しい「ネイティブ→JS」のデータ連携はこのパターンに倣う。
- **繰り返しタスクは `tasks` 配列にシリーズごと多数の個別インスタンスとしてフラット展開される**（`generateCustomDates()`）。削除・一括編集機能を追加する時は、IDベースの単純な1件操作だけで済ませず、シリーズ全体を対象にする操作が必要か検討する（`delTask(id, seriesOf?)` のパターンに倣う）。
- **stale closure に注意。** `useEffect(...,[])`（空deps、マウント時1回登録）の中で `tasks`/`date` 等の変化するstateを直接参照しない。`xxxRef` を別のeffectで毎レンダー同期させ、そちら経由で読む（`autoIconRef`・`migrationDataRef`等の既存パターン）。

## 実装の進め方

1. 類似の既存機能をgrepし、採用されている設計パターン（上記のどれに当てはまるか）を特定する
2. 新しい型フィールド・localStorageキーが必要なら、既存の `Task`/`Settings` 型や命名規則（`xxx?:boolean`, `tl-xxx-v1`）に合わせる
3. 必要最小限の変更で実装し、関係ない箇所は触らない
4. PRO機能であれば `isPremium`/`ProGateSheet` の既存ゲートパターンを使う（`brainbox-security` スキルも参照）
5. 新しい文言は `tr()`/`STRINGS` で全9言語分埋める（`brainbox-localization` スキル参照）
6. UIを新設・変更するなら `brainbox-ui` スキルのパターンに従う
7. 実装後、`npm run build` で型チェック（iOS実機確認が要る変更は `./build-ios.sh`、`npm run build && npx cap sync ios` の手打ちは禁止——`out/`が更新されず古いままになる既知の事故）
8. 変更後に必要なテスト項目を提案する（`brainbox-release` スキル参照。テストフレームワークは無いため手動確認観点を列挙する）

## 避けるパターン

- 推測ベースでの実装・「たぶんこうなっている」での変更
- 新しい抽象化・ヘルパー関数の先回り追加（3行の重複よりは早すぎる抽象化を避ける）
- Web版の挙動だけ確認してネイティブ影響を未確認のまま完了報告する
- 新しいバックエンドAPI/Vercelプロジェクトの追加（既存方針と矛盾する）
- 1つのリクエストで複数箇所を同時に変える（CLAUDE.md方針: 小さく直す）

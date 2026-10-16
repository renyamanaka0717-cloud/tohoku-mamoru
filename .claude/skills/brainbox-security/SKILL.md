---
name: brainbox-security
description: Use when touching anything security/privacy-sensitive in BrainBox — Firebase Auth/Firestore code (Cloud.ts), RevenueCat/Pro-gating logic (Premium.tsx, ProGateSheet checks), API keys/secrets, Analytics event params, or cross-device sync. Also use proactively before finishing any task that adds a new paid feature, a new localStorage/Firestore field, or a new external API call, to check for data leaks or bypassable paywalls. Reports findings with concrete fixes rather than vague warnings.
---

# BrainBox セキュリティ確認スキル

BrainBoxは個人開発・サーバーDBなし（localStorage中心、ログイン時のみFirestore併用）のアプリ。チェック対象は小さいが、課金バイパス・個人情報漏洩・認証情報の扱いミスは実害が大きいので丁寧に見る。

## チェック観点1: Firebase Auth / Firestore（`src/app/components/Cloud.ts`）

- **Firestoreセキュリティルールが `users/{uid}` 配下を `request.auth.uid == uid` で制限しているか。** ルール未設定だと全ユーザーが他人のデータを読み書きできる。このリポジトリにルールファイルは無く、Firebase Console側の手動設定に依存している——コード変更時にルールの前提を壊していないか（新しいコレクションパスを追加した場合、同じ `users/{uid}/...` 配下に収まっているか）を確認する。
- **id付き配列データ（tasks/shopItems等）は「1件=1ドキュメントのサブコレクション」方式を維持しているか。** 配列全体を1フィールドとして上書き保存する方式に戻すと、複数端末間の統合が壊れるだけでなく、片方の端末の全データが意図せず消える事故になる。
- **`Settings` のような単一オブジェクトは「クラウドにまだ無い時だけ書く」(`writeSettingsIfAbsent`相当) になっているか。** 無条件上書きは他端末の設定を消すデータロスになる。
- **「この端末は移行済みか」の判定が端末ローカルの `localStorage`（`CLOUD_MIGRATED_KEY`）であり、Firestore側のグローバルフラグになっていないか。** グローバルにすると2台目の端末のデータが永久に統合されなくなる。
- ログイン・移行処理で `localStorage` のデータを削除・上書きするコードが紛れ込んでいないか（移行は常に追加的=additiveであるべき）。
- `onCloudAuthChange` 等のマウント時コールバック内で `tasks` 等のstateを直接参照していないか（stale closure。`migrationDataRef` 経由で読むのが正しい）。

## チェック観点2: 課金・Pro機能のバイパス防止（`Premium.tsx`、PRO機能全般）

- 新しいPRO機能に `isPremium` チェックが正しく入っているか。既存の `ProGateSheet` パターン（非PROなら操作をブロックしてシートを出す）を使っているか。
- **音声入力の `VoiceCapturePopup` のように `TaskModal` を介さない独立した起動経路がある場合、その経路自身で `isPremium` を確認しているか。** 親コンポーネントのゲートに依存して「通ってしまう」バイパスが過去に起きやすいパターン。
- `isPremium` をブラウザ・開発環境以外でハードコード `true` に戻していないか。
- Android の `FORCE_PREMIUM_ANDROID`（クローズドテスト用強制PRO化）が `isAndroidNative()` との二重ガードを保っているか（環境変数だけの判定に弱めると、ビルド成果物の取り違えでiOSに波及するリスクがある）。これを開発者モード（`DEV_PREMIUM_OVERRIDE_KEY`）と混同・統合していないか。
- RevenueCatの動的importに `webpackIgnore: true` を付けていないか（付けると実機で `import()` が解決できず購入機能が全滅する実績あり）。
- `@revenuecat/purchases-capacitor` を static import していないか（ビルドエラーになる）。

## チェック観点3: APIキー・秘密情報

- 新しいAPIキー・シークレットを `page.tsx`/コンポーネントにベタ書きしていないか。環境変数（`.env.local`/Vercel環境変数）経由になっているか。
- `GROQ_API_KEY` のようなサーバー専用シークレットが `src/app/api/` 配下（サーバーサイド）以外、クライアントバンドルに混入していないか（`NEXT_PUBLIC_` prefixの有無を確認——prefix無しならサーバー専用のはず）。
- RevenueCatの `RC_API_KEY`（`appl_...`）のようなクライアント公開鍵は元々公開前提（App Store配布物に含まれる）なので秘匿不要だが、逆にFirebase Admin SDKのサービスアカウント鍵のようなサーバー専用シークレットをクライアントコードに置いていないか確認する。

## チェック観点4: Firebase Analytics のプライバシー方針（厳守）

**送ってはいけないもの:** タスク名、買い物リストの中身、メモの内容、住所・施設名、緯度・経度、メールアドレス、ユーザー名、その他個人を特定できる情報。

- 新しい `logAnalyticsEvent(name, params)` 呼び出しを追加・変更する時、`params` に上記のいずれかが紛れていないか1つずつ確認する。
- 場所関連イベントは半径（`radius`）のような非識別の設定値のみ許可。実際の場所名・カテゴリ推測ロジックを追加しない（既存方針: 自由入力でカテゴリ分類の仕組みが無いため「何も送らない」）。
- 言語のようなユーザー単位の属性は `logAnalyticsEvent` の `params` ではなく `setAnalyticsUserProperty` のユーザープロパティとして送られているか（イベントパラメータに混ぜない）。
- 権限許可系イベント（`notification_permission_granted`等）は `logPermissionGrantedOnce()` 経由で重複防止されているか（呼び出し元で直接 `logAnalyticsEvent` していないか）。

## チェック観点5: 位置情報の取り扱い（Geofence関連）

- 位置情報を通知判定以外の用途（サーバー送信・利用履歴の永続保存など）に使っていないか。`UserDefaults`/`SharedPreferences` に保存して良いのはクールダウン用タイムスタンプと場所名の辞書のみ。
- 新しい場所通知機能で `MAX_MONITORED_REGIONS` の上限（他カテゴリとの共有予算）を無視して無制限に登録していないか。

## 報告形式

- 問題を発見したら「何が起きうるか（具体的な悪用/漏洩シナリオ）」と「修正案（diffレベルの具体性）」をセットで示す。
- 実行していない検証（「実機で確認した」「Firestoreルールを実際に適用して確認した」等）を確認済みと報告しない。コード上の静的な確認であることを明示する。
- 問題が見つからなかった場合も、確認した観点を簡潔に列挙する（「何を見て問題なしと判断したか」を残す）。

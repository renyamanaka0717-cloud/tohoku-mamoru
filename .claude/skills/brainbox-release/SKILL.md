---
name: brainbox-release
description: Use before shipping a BrainBox change to production — pushing to main, running build-ios.sh/build-android.sh, or when the user says "release", "deploy", "リリース", or asks for a pre-release check. Produces a concrete checklist of what changed across Web/iOS/Android, what manual tests to run (no automated test suite exists), and App Store/Google Play review considerations specific to this app.
---

# BrainBox リリース前チェックスキル

BrainBoxにはテストフレームワークが無い。リリース前確認は**実際の変更内容からチェックリストを組み立てる手動確認**が中心。このスキルは「何を確認すべきか」を整理するためのもので、ここに書かれた確認を実行したと偽って報告しない——実行できるものは実行し、実機/ストア確認のように環境上できないものは「要・手動確認」と明記する。

## 手順1: 変更差分の洗い出し

```bash
git status --short
git diff --stat origin/main
```
変更ファイルから影響プラットフォームを判定する:
- `src/app/page.tsx` / `src/app/components/*.ts(x)` のみ → Web影響。`native-ios/`/`native-android/`の対応プラグインに変更が無いか必ず確認（JS側だけ直してネイティブ側の対応プラグインを更新し忘れるパターンが頻発している）
- `native-ios/*.swift`/`.m` → iOS実機ビルド・Xcode手動セットアップの再確認が要る（`ios/`はgitignore対象のため、`git pull`では既存Xcodeプロジェクトに反映されない。差し替え手順はCLAUDE.mdの各機能節に明記されている）
- `native-android/*.kt` → Android Studio側の手動コピーが要る（同様に`android/`はgitignore対象）
- `I18n.tsx`/`STRINGS` → `brainbox-localization` スキルで翻訳網羅性を確認

## 手順2: ビルド確認（実行可能なもの）

```bash
npm run build   # Web/Vercel向け。型チェック含む。これが通らない限りコミットしない
npm run lint
```
iOS実機反映が必要な場合、**`npm run build && npx cap sync ib` を手打ちしない**。必ず:
```bash
./build-ios.sh   # BUILD_TARGET=ios npm run build → cap sync ios まで一括
```
`BUILD_TARGET=ios`無しの通常buildは`out/`を更新しないため、手打ちすると古いWebコンテンツのまま実機に反映される既知の事故パターン。

## 手順3: 既存機能への影響確認（回帰チェック観点）

変更箇所に応じて、以下の「壊れやすいポイント」を重点確認する（CLAUDE.mdの実際の不具合履歴に基づく）:

- **タイムラインのレイアウト計算**（`Timeline`コンポーネント）に触れた場合: `measuredH`のキーが`task.id`ベースか、日付をまたいで使い回していないか、Phase 0/1/2の積み上げループが全て同じ`g.h`を参照しているか
- **繰り返しタスク**に触れた場合: `editScope==='all'`の更新フィールド漏れ、削除がシリーズ全体(`seriesOf`)を正しく扱うか
- **通知系**に触れた場合: バックグラウンド/未起動で発火が必要なものがネイティブ事前予約方式になっているか（`now`ポーリングだけで実装していないか）
- **PRO機能**を追加した場合: 新しい起動経路すべてに`isPremium`ゲートがあるか（`brainbox-security`スキル参照）
- **多言語文言**を追加した場合: 9言語すべて埋まっているか（`brainbox-localization`スキル参照）
- **PC版(`isDesktop`)**に触れた場合: モバイル側の見た目・動作を壊していないか（`isDesktop`条件分岐が正しくガードされているか）

## 手順4: 課金・認証の動作確認観点（実機が必要、チェックリストとして提示）

- RevenueCatの動的importが`webpackIgnore:true`無しであること（静的grep で確認可能: `grep -n "webpackIgnore" src/app/components/Premium.tsx` が何もヒットしないことを確認）
- 新規/変更したPRO機能が、Web/開発環境（常に`isPremium=true`）とネイティブ未購入状態の両方でどう見えるか（開発者モードの`DEV_PREMIUM_OVERRIDE_KEY`で擬似確認可能、実購入フローは実機テスターに委ねる）
- Googleログイン/Appleログインを触った場合: Firestoreセキュリティルールの前提を壊していないか（`brainbox-security`スキル参照）

## 手順5: バージョン管理

- `package.json`の`version`、iOS側のXcodeプロジェクトのBuild/Version、Android側の`versionCode`/`versionName`が揃っているか（このリポジトリの`package.json`自体はアプリストアバージョンと直結しないため、ストア提出時は別途Xcode/Android Studio側の値を確認するよう伝える）
- `CHANGELOG`的な記録はCLAUDE.mdの該当節に倣って重要な不具合修正・設計変更を残す（プロジェクトの既存慣習）

## 手順6: ストア掲載・審査上の注意点（整理のみ、実際の提出はユーザー作業）

- **App Store Connect**: 日本語（プライマリ）＋ 英語・韓国語・繁体字中国語ロケールが既に公開中。新バージョンのリリースノートは**4ロケール全部**に同内容を入れる（日本語だけ更新すると他ロケールが古いまま公開され続ける）。スクリーンショットのファイル名は半角英数字のみにする（過去に日本語ファイル名でロケール保存エラーが発生した実績）。
- **配信国**: EU圏（フランス含む）は意図的に配信対象外（DSAのTrader開示要件回避のため）。この除外を「一貫性がない」として解除しない。
- **RevenueCat製品ID**（`jp.brainbox.app.premium.monthly`）やAPI Key（`appl_zyfcgKyGHORBKcOppeougWslCRP`、`O`はゼロでなく英字）がコードと一致しているか最終確認する。
- Android: `FORCE_PREMIUM_ANDROID`環境変数を**本番ビルドに付けていないか**（クローズドテスト専用。`NEXT_PUBLIC_FORCE_PREMIUM_ANDROID=true`を付けたまま本番AABをビルドしないよう念押しする）。

## 手順7: Vercel/Git

- `main`または`claude/**`へのpushでGitHub Actions経由のVercel自動デプロイが走る。デプロイを実行した時だけ「デプロイしました」と報告する（CLAUDE.md Response Policy）。
- pushは`git fetch origin main && git rebase origin/main && git push origin HEAD:main`（コンフリクト時は素直に解消。force-pushは明示指示があるときのみ）。

## 出力形式

変更内容から実際に該当する項目だけを絞り込んだチェックリストを提示する。該当しない項目（例: 通知系を触っていないのに通知チェックを並べる）は省く。「実行済み」と「要・手動確認（実機/ストア）」を明確に分けて書く。

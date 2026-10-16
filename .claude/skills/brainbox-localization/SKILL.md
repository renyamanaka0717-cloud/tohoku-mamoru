---
name: brainbox-localization
description: Use when adding any new user-facing text to BrainBox, adding a new UI screen/component, or adding/auditing a new language. Covers I18n.tsx's STRINGS/tr() system, the 9 supported languages (ja/en/ko/zh-TW/es/pt/vi/th/id), where translations typically get missed (standalone components, confirmation popups, PRO-gate messages), and header/width overflow pitfalls per language.
---

# BrainBox 多言語対応スキル

対応言語は **9言語**: `ja`/`en`/`ko`/`zh-TW`/`es`/`pt`/`vi`/`th`/`id`（`src/app/components/I18n.tsx` の `Language` 型が正）。アプリ本体UIはこの9言語で完了済み（開発者モード画面のみ意図的に未対応）。ネイティブ（App Store Connect掲載メタデータ）はja/en/ko/zh-TWのみ。

## 新しい文言を追加する時の基本ルール

1. **新しい文言はすべて `I18n.tsx` の `STRINGS` に追加し、`useI18n().tr(key)` で参照する。** 日本語をベタ書きしない。
2. `STRINGS[key]` は9言語**全部**のフィールドが必要（型チェックで強制される）。意味のある翻訳を入れずに同じ文字列を使い回さない。
3. `page.tsx` 本体で翻訳関数を受け取る変数名は **`tr`**（`t` にしない。`tasks.map(t=>...)` 等のループ変数と衝突するため）。
4. 新しいコンポーネントを作る時、`useI18n()` を呼び忘れて `tr`/`language` がスコープに無いまま日本語をベタ書きしない。独立コンポーネント化された小さいUI（ピッカー・ポップアップ等）で実際に何度も発生した抜け漏れパターン。

## 翻訳漏れを探す監査手順

```bash
grep -n "[ぁ-んァ-ヶ一-龯]" src/app/page.tsx \
  | grep -v "tr(" | grep -v "language===" \
  | grep -vE "^\s*[0-9]+:\s*//" | grep -vE "\{/\*.*\*/\}"
```
除外すべき false positive: JSXコメント、型定義直後のJSコメント、既に `language==='ja'?...:...` で分岐済みの行、曜日/月名配列の定義自体。

**よく見落とされるカテゴリ（実績あり・新しい言語を追加する時も同じ場所に抜けが残りやすい）:**
- 独立コンポーネント化された小さいUI（アイコンピッカー・地図ピッカー・PROペイウォールシート等）— `useI18n()`自体を呼んでいないことがある
- モーダル内の確認ダイアログ・ポップアップ（削除確認・変更確認）— 本体は翻訳済みでも、そこから開く確認ポップアップだけ後から追加されて漏れているパターン
- コピペで作られた画面（コピー元に`tr()`が付いていてもコピー先は付け忘れていることがある）
- ドラッグ&ドロップ中の一時ラベル
- `setProPrompt('機能名')` のように呼び出し側でベタ書きされたPROゲート説明文（20箇所近く散在するため見落としやすい）

**モジュール共通の `language` ではなく、独自の `lang` 引数を取る関数**（`deadlineRemainLabel(deadlineAt,lang)`・`durLabel(m,lang)`）や `language==='en'` を直接チェックする独立ローカル関数（`SearchPage`内の`fmtDate`等）は `grep "language==='ja'"` だけの監査網に引っかからない。`grep ":\s*Language(\s*=|\))"` で `Language` 型引数を取る関数を明示的に洗い出し、新言語追加と同時にこれらにも分岐を追加すること。

## 言語ごとの文字数・幅の考慮（文字切れ防止）

- 曜日1文字の取得は共通ヘルパー `dayNameFor(language,i)`（I18n.tsx）を使う。独自実装しない。
- 月名は言語によって型が違う: 日本語/韓国語/繁体字中国語/ベトナム語は「数字+単位」型（専用配列を持たない、呼び出し側で組み立て）、英語/スペイン語/ポルトガル語/タイ語/インドネシア語は「月ごとの固有名詞」型（`MONTH_NAMES_XX`配列が必要）。新しい言語を追加する時はどちらの型かまず確認する。
- **チップ・ボタンの幅を言語ごとに固定pxで調整しない。** 過去に `width:language==='ja'?'84px':...` のような実装が、新言語追加のたびに「はみ出る」「近すぎる」「他要素を押し出す」を繰り返した。ラベル`<span>`を`position:absolute`にせず通常フローに戻し、内容に応じた自動幅にするのが正しい設計（既存の `headerFreeTimeToggle` 修正を参照）。
- **長いフルスペル表記（月名＋連結語等）がヘッダーのアイコン群を画面外に押し出さないよう、安全網を必ず維持する**: タイトル`<span>`に`truncate min-w-0`、アイコン群に`shrink-0`、親flexに`gap-2`。新しいヘッダー要素を追加する時もこの3点を崩さない。
- 区切り文字（`'・'`/`'、'`等）が `language==='ja'?区切り記号:', '` の2値分岐になっている箇所: 新言語がラテン文字圏なら通常追加コード不要だが、**繁体字中国語は日本語と同じ全角句読点圏**なので `(lang==='ja'||lang==='zh-TW')?...` のように明示的に含める必要がある（CJK圏かラテン文字圏かで対応方向が逆転する点に注意）。
- `defaultIconKey(name)`（タスク名→アイコン自動判定、正規表現キーワードマッチ）に新言語のキーワードを追加し忘れない。ラテン文字圏言語（es/pt/vi/id）はアクセント付き文字が`\b`単語境界と相性が悪いため `/i`フラグのみの部分一致にする。動詞/名詞で語形が変わる単語（`desayuno`/`desayunar`等）は両方キーワード登録する。

## ネイティブ側（Swiftの言語判定、JS の `tr()` が呼べない箇所）

- `GeofencePlugin.swift` 等バックグラウンド発火するネイティブコードは、JSが `WidgetDataPlugin.updateWidgetData()` 経由で書き込む `appLanguage` キー（App Group共有UserDefaults）を読んで判定する。`AppLang` enumに新言語のcaseを追加し、該当する全switch文（GeofencePlugin.swift内に複数箇所）に分岐を足す。
- ホーム画面ウィジェットは端末のシステム言語で自動切り替え（String Catalog、`Localizable.xcstrings`）——アプリ内`language`状態とは独立したレイヤー。繁体字中国語は `"zh-Hant-TW"`、ポルトガル語は `"pt-BR"` のように地域付きロケールキーが必要な場合がある（言語ごとにApple慣例を確認する）。

## 確認・検証

- JS側の翻訳はPlaywrightで `localStorage.setItem('tl-language-v1','<言語コード>')` をセットして検証できる（`npm install --no-save playwright-core` で一時導入し、確認後は必ず `npm uninstall playwright-core` で削除する）。
- `npm run build` を必ず通す。`Language`型を拡張すると分岐漏れの `switch`/三項演算子が型エラーで検出できることがある。
- ネイティブ側（ウィジェット・バックグラウンド通知の文言）はブラウザでは検証不可。実機確認が必要なことを明示する。

## 避けるパターン

- `STRINGS`に新キーを追加する時、9言語のうち一部だけ埋める
- 設定の「言語/Language」行自体の表記を動的`tr()`翻訳に変える（意図的な固定バイリンガル表記。過去に重複表示の不具合実績あり）
- ウィジェットの文言をアプリ内`language`状態から制御しようとする（端末システム言語に委ねる別レイヤー）

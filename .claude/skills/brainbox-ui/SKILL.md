---
name: brainbox-ui
description: Use when designing or implementing any UI/UX change in BrainBox (src/app/page.tsx, components/) — new screens, new cards/buttons/modals, layout tweaks, color/spacing changes, or PC(isDesktop)/mobile responsive work. Ensures new UI matches BrainBox's existing design system (colors, iOS-settings-style cards, safe-area handling, timeline layout rules) and ADHD-friendly simplicity instead of inventing a new style.
---

# BrainBox UI/UX Skill

BrainBoxは「iOS設定画面 / Structured風」のシンプルな手帳アプリ。新しいUIを作る前に、必ず既存パターンを探して流用する。**推測で書かず、`src/app/page.tsx` を Grep してから書くこと。**

## 絶対に守る基本ルール

1. **新規コンポーネントを作る前に `src/app/page.tsx` 内に似た既存パターンがないか Grep する。** 1ファイル集約（約1万行超）が意図的な設計なので、無闇に分割しない。
2. **アイコンは `AppIcons`（`src/app/components/Icons.tsx`）経由のみ。** `@phosphor-icons/react` を `page.tsx` で直接 import しない。新アイコンは先に `Icons.tsx` の `AppIcons` に追加する。
3. **多言語前提で書く。** 新しい文言は日本語ベタ書きではなく `useI18n()` の `tr()` + `I18n.tsx` の `STRINGS` に追加する（`t` という変数名は使わない。ループ変数と衝突するため `tr` のまま）。
4. **ADHDユーザー向け**: 装飾・情報量を増やさない。1画面1目的。色は選択状態など必要最小限にしか使わない。文章は短く・具体的に。

## カラーシステム（コードの正）

```
メインアクセント: #D9A3B2（ダスティピンク）— 選択中タブ・FAB・バッジ・TaskModalヘッダー
ソフトレッド:     #D97A7A — 削除・エラーのみ
プライマリ黒:     #1F1F1F — 重要ラベルのみ
テキスト主:       text-gray-800
テキスト副:       text-gray-400
カード背景:       bg-white
ヘッダー/フッター背景: bg-gray-50
```

**禁止:** 旧テーマカラー `#7FAE8C`（セージグリーン）を新たに使わない。`rounded-full` カプセルをメインナビに使わない。週カレンダーの曜日を日曜赤/土曜青に色分けしない（全曜日 `text-gray-400`）。

ユーザーが選べるテーマ色自体（`THEMES`配列、`page.tsx`）は複数あり、CSS変数 `var(--c-primary)` 経由で参照される。**`var(--c-primary)` に半透明を掛けたい時は `bg-[var(--c-primary)]/N` を使わない**（hex文字列のCSS変数にTailwindの不透明度修飾子は効かず透明なまま描画される実績あり）。必ず `color-mix(in srgb, var(--c-primary) N%, white)` を inline style で使う。

## 標準コンポーネントパターン

タップ項目（設定行など）:
```jsx
<button className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
  <AppIcons.XXX size={18} className="text-gray-400 shrink-0"/>
  <span className="flex-1 text-left text-sm font-medium text-gray-800">ラベル</span>
  <AppIcons.caretRight size={14} className="text-gray-300"/>
</button>
```
区切り線: `<div className="h-px bg-gray-100 mx-4"/>`

ポップアップ/ボトムシート（モバイルは下から、PC=`isDesktop`時は中央）:
```jsx
<div className="fixed inset-0 z-[100] bg-black/40 flex items-end justify-center lg:items-center" onClick={onClose}>
  <div className="bg-white w-full max-w-md rounded-t-3xl lg:rounded-b-3xl px-5 pt-5 pb-10 shadow-2xl">...</div>
</div>
```
`rounded-t-3xl` を `rounded-3xl` に置き換えない。`lg:rounded-b-*` を別ユーティリティとして追加する（優先順位の衝突を避けるため）。

## PC（`isDesktop`）対応の判断基準

```typescript
const [isDesktop,setIsDesktop] = useState(false);
useEffect(()=>{
  const check=()=>setIsDesktop(window.innerWidth>=1024);
  check(); window.addEventListener('resize',check);
  return ()=>window.removeEventListener('resize',check);
},[]);
```
- `1024px` は Tailwind の `lg:` と完全一致させる。ズラさない。
- **見た目だけの微調整（中央寄せ・角丸・余白）は `lg:` バリアントで済ませる。** `isDesktop` をサブコンポーネントへ新規propで配線するのは、構造自体を変える必要がある時だけ（右パネル常時表示化・マウスドラッグ付与など）。
- ネイティブ（iOS/Android, Capacitor）には `isDesktop` 分岐を持ち込まない。`window.innerWidth` はWKWebView/WebViewでも技術的に取得できるが、ネイティブは常にスマホ幅の設計。

## タイムラインのレイアウト（最重要・壊しやすい箇所）

`Timeline` コンポーネントは絶対配置＋実測ベースの複雑な仕組み。触る前に CLAUDE.md の「タイムラインのY座標計算」「タイムラインのカード高さ計測」節を読むこと。

- カード位置は実時刻ではなく「詰めて配置」。現在時刻インジケーター・ドラッグ判定には必ず `layoutCalcY`/`layoutYRef`/`yToTimeRef`（anchors区分線形補間）を使う。実時刻ベースの単純な線形変換を書かない。
- カード高さは `measuredH`（`task.id` キーの ResizeObserver 実測）優先、未測定時は `estimateTaskH(t)` にフォールバック。新しくTaskCardに常時表示の行（タグ・住所・メモ等）を追加したら `estimateTaskH` にも加算を追記すること（忘れても実測後に自動補正されるが一瞬重なって見える）。
- `AXIS_X=72`・`CARD_LEFT=108` はセマンティック定数から導出。固定pxを直書きしない。
- 時刻ラベルは `w-10 text-right pr-1`（40px）で統一。`w-12` を使わない。
- `Timeline` を複数カラム表示（PC版 `MultiDayColumn`）に流用しない。横幅が狭いカラムには絶対配置前提のロジックが壊れる。新しいカラムUIが要るなら `MultiDayColumn` を拡張する。

## iOS セーフエリア（新しいフルスクリーン画面を追加する時は必須）

```jsx
<div style={{paddingTop:'calc(1rem + env(safe-area-inset-top))'}}>
```
メインヘッダー・CalendarPage・SearchPage・SettingsScreen の `subHeader()` すべてこのパターン。忘れるとCapacitor実機で時計/ノッチにかぶる。

## デザイン方針（避けるパターン）

- 余白が広すぎる・カードが多すぎて縦長になる設計
- 見た目が変わらない微調整だけで終わらせる（構造から変えること）
- グラデーション、過度なアニメーション・影
- 既存パターンを無視した突発的なスタイル
- 同一時刻タスクのアイコンを固定56px円形カプセルにする（現在は伸縮・連結スタイル、CLAUDE.md「同一時刻タスクのアイコン表示」節参照）
- `CompactTaskCard` を呼び出す（dead code）
- 左サイドバー（PC版）を復活させる（ユーザー指示で撤去済み。ナビはヘッダー右アイコン行＋右パネルタブに統合済み）

## 作業の進め方

1. 変更対象の画面/コンポーネントを `Grep` で特定し、既存の類似UIを読む
2. 使う色・余白・角丸が上記カラーシステム/標準パターンと一致するか確認
3. PC/モバイル両方の見た目を確認する必要があるか判断（`isDesktop`分岐が要るか）
4. 新しい文言は `tr()` + `STRINGS` 経由にする（`brainbox-localization` スキルも参照）
5. `npm run build` で型チェックを通してから完了とする

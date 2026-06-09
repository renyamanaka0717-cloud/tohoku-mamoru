# CLAUDE.md — tohoku-mamoru

## プロジェクト概要

**1日タイムライン** — iPhone (Safari) 向けの日本語・モバイルファーストな1日タイムライン型タスク管理アプリ。
Next.js 単一ページ構成。UIラベルはすべて日本語。ユーザーアカウントなし、データはすべて localStorage。

---

## 使用技術

| 層 | 技術 |
|----|------|
| フレームワーク | Next.js 15 (App Router) |
| 言語 | TypeScript (strict) |
| スタイル | Tailwind CSS 3（ユーティリティのみ、コンポーネントライブラリ不使用）|
| AI | Groq API `llama-3.3-70b-versatile` — `/api/generate` 経由（メインUIとは独立）|
| ストレージ | `localStorage` のみ（DBなし）|
| 動作環境 | ブラウザ / iOS Safari |

---

## ディレクトリ構成

```
/home/user/tohoku-mamoru/
├── src/
│   └── app/
│       ├── page.tsx        ← フロントエンド全体（1,950行超、単一ファイル）
│       ├── layout.tsx      ← HTML シェル、viewport meta、フォント
│       ├── globals.css     ← Tailwind + iOS スクロール修正 + line-clamp
│       └── api/
│           └── generate/
│               └── route.ts  ← Groq AI エンドポイント（Threads投稿生成）
├── CLAUDE.md
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
└── .env.local.example      ← GROQ_API_KEY テンプレート
```

> **プロダクトコードはすべて `src/app/page.tsx` 1ファイルに集約されている。**
> ユーザーから明示的に指示されない限り、複数ファイルに分割しないこと。

---

## 開発コマンド

```bash
npm run dev      # 開発サーバー起動 (http://localhost:3000)
npm run build    # プロダクションビルド（コミット前に必ず実行して型エラーを確認）
npm run lint     # ESLint チェック
```

**コミット前に必ず `npm run build` を実行すること。型エラーがあるとビルドが失敗する。**

---

## Git ブランチ

- 開発ブランチ: `claude/daily-timeline-todo-app-uvvUQ`
- プッシュ先: `origin claude/daily-timeline-todo-app-uvvUQ`

---

## アーキテクチャ：page.tsx の全体構造

### コンポーネントツリー

```
App（メイン）
├── MonthCalendar       モーダル — 月グリッドカレンダー
├── CalendarPage        フルスクリーン月ビュー
├── SearchPage          フルスクリーンタスク検索
├── TaskModal           タスク作成/編集シート（3モード）
├── TaskCard            タスク1行カード
├── FreeTimeCard        空き時間提案カード
├── Timeline            時間軸スクロールタイムライン
└── BottomTabs          ボトムシート：あとでやる＋買い物リスト
```

### データ型

```typescript
interface Task {
  id: string
  name: string
  startTime: string | null   // "HH:MM" or null
  duration: number           // 分; 0 = 未設定
  memo: string
  icon: string
  completed: boolean
  date: string               // "YYYY-MM-DD"
  isLater: boolean           // true = あとでやるトレイ
  recurrence?: 'daily'|'weekly'|'monthly'|'yearly'|'custom'|null
  customRec?: CustomRec
  pinned?: boolean
  tags?: string[]
  notifications?: number[]   // 開始N分前; 0=開始時刻, 1440=前日
  incompleteReminder?: boolean
  category?: string          // '個人' | '仕事' | undefined
}

interface Settings {
  wakeTime: string   // "HH:MM"
  sleepTime: string  // "HH:MM"
}

interface FreeSlot { start: string; end: string; min: number }
interface ShopItem  { id: string; name: string; checked: boolean }
```

### localStorage キー

| キー | 内容 |
|------|------|
| `tl-tasks-v2` | `Task[]` 全件 |
| `tl-settings-v2` | `Settings` |
| `tl-shop-v1` | `ShopItem[]` |

state 変化のたびに `useEffect` で保存。

### 主要定数

```typescript
PX_PER_HOUR      = 40       // 1時間あたりの基準ピクセル
PX_PER_MIN       = 40/60    // 1分あたり ≈ 0.667px
BASE_SLOT_HEIGHT = 40       // 1時間行の最小高さ (px)
CARD_GAP         = 12       // カード間の縦方向ギャップ (px)
MIN_CARD_H       = 72       // タスクカードの最小高さ (px)
AXIS_X           = 52       // 時間軸線のX座標
CARD_LEFT        = 68       // カード開始X座標 (AXIS_X + 16)
CATEGORIES       = ['個人', '仕事']
```

---

## タイムラインレイアウトシステム（最重要・最複雑）

**このシステムを理解せずにレイアウト関連のコードを触らないこと。**

### 行ベースレイアウト

各時間には `HourRow` が1つある：

```typescript
type HourRow = { hourMin: number; rowHeight: number; top: number }
```

- `top` は累積値（それ以前の行の `rowHeight` の合計）
- `rowHeight` = `max(BASE_SLOT_HEIGHT, 最も下のカードの底 + CARD_GAP)`
- 空き時間カードの高さ = `96 + min(fitsN, 3) * 36` px（内容基準、duration比例ではない）

**重要:** 行はカードに合わせて拡張される。空き時間カードで1行が200px超になることがある。
**Y計算には必ず `hourRows` を使うこと。`min * PX_PER_MIN` は使ってはいけない。**

### 時刻 ↔ Y 変換

```typescript
// 時刻 → Y（Timeline 内部の rowCalcY）
rowCalcY(min) = row.top + (min - row.hourMin) / 60 * BASE_SLOT_HEIGHT

// Y → 時刻（親コンポーネントの calcTime、ドラッグ時）
relY = (clientY + window.scrollY) - dragContainerTopRef.current
// hourRows を走査: frac = min(relY - row.top, BASE) / BASE
```

### layoutRef

Timeline が内部データを親のドラッグハンドラへ渡すためのref：

```typescript
layoutRef.current = {
  hourRows,
  wakeMin,
  BASE: BASE_SLOT_HEIGHT,
  container: HTMLDivElement  // Timeline ルートdivへの参照
}
```

`useLayoutEffect`（deps なし）でレンダリング後に毎回同期セットされる。

---

## ドラッグ&ドロップシステム

タスクカードの長押し（500ms）でドラッグ開始。Timeline・BottomTabs の両方から動作。

### 実装の要点

1. **ドラッグ開始** (`startDrag` in App):
   - `containerDocTop = rect.top + window.scrollY` をページ座標で `dragContainerTopRef` に保存（スクロール不変値）
   - `dragTask`, `dragPos` セット、`activeTab` をクローズ

2. **ドラッグ中** (`useEffect` on `dragTask`):
   - `touchmove` + `touchend` を `{passive: false}` で `document` に登録 → `e.preventDefault()` でスクロール阻止
   - `calcTime(clientY)` で指の位置を5分刻みの時刻に変換
   - 計算式: `relY = (clientY + window.scrollY) - dragContainerTopRef.current`

3. **ドロップライン描画**（Timeline コンテナ内部）:
   - ラインY = `rowCalcY(toMin(dropTime))` — 生の `relY` ではなく **スナップ後の時刻から逆算**
   - **重要:** 拡張行では `relY ≠ rowCalcY(T)` になる。生の `relY` をライン位置に使ってはいけない
   - ライン・時刻バッジは共にコンテナ内の `position: absolute`（時間ラベルと同じ座標系）

4. **ドロップ**: `calcTime(changedTouches[0].clientY)` を新しい `startTime` として適用

5. **ゴミ箱**: 画面下端100px にドラッグ → リリースでタスク削除

### ドロップラインをコンテナ内に描画しなければならない理由

青いドロップラインは `fixed` オーバーレイではなくスクロール可能な Timeline コンテナ内に描画する。
これにより時間ラベルと全く同じ座標系・親要素を共有でき、構造的にズレが起きない。

---

## TaskModal の3モード

| モード | 日本語 | 動作 |
|--------|--------|------|
| `later` | あとでやる | 時刻なし、トレイへ追加 |
| `scheduled` | 時間指定 | 特定日付＋開始時刻 |
| `recurring` | 繰り返し | 複数のTask インスタンスを生成 |

繰り返しタスク：
- プリセット: 毎日 / 毎週 / 毎月 / 毎年
- カスタム (`CustomRec`): 頻度・間隔・曜日・月日ルール・終了条件
- 保存時: 最大52件のインスタンスを個別 `Task` として生成（同じ recurrence メタデータを持つ）
- 編集ダイアログ: 「この予定のみ」vs「すべての予定」

---

## 完成している機能

- [x] 時間軸ベースのスクロール可能な日別タイムライン
- [x] タスクカード（アイコン・時間範囲・所要時間バー・タグ）
- [x] 空き時間スロット自動検出・表示
- [x] 長押しドラッグでスケジュール変更（タイムライン・あとでやるトレイ両対応）
- [x] ドラッグでゴミ箱（削除）
- [x] ドロップライン＋時刻バッジ（Timeline コンテナ内描画）
- [x] あとでやるトレイ（ソート・ピン・タイムラインへ移動）
- [x] 買い物リスト
- [x] タスク作成/編集（名前・アイコン・所要時間・メモ・タグ・カテゴリ・通知）
- [x] 繰り返しタスク（プリセット＋カスタムルール）
- [x] カテゴリフィルタータブ（個人 / 仕事）
- [x] 週ストリップ日付ナビゲーション（スワイプ対応）
- [x] 月カレンダーピッカー
- [x] フルスクリーン検索
- [x] 設定（起床・就寝時刻、未完了タスクの翌日繰り越し）
- [x] 現在時刻インジケーター
- [x] 空きスロットへのクイック割り当てボタン
- [x] タスク名からのアイコン自動推定（正規表現パターン）
- [x] localStorage 永続化
- [x] 長押し時のハプティクフィードバック（navigator.vibrate）

---

## 現在の不具合

以下の4件が未解決で優先対応が必要：

### 不具合1: 空き時間カードと左側の時間表示が重なる
- **症状**: 空き時間カードが拡張行内に描画されるとき、隣接する時間ラベルと視覚的に重なって見える
- **根本原因**: `getCardH` が常に最低96pxを返すため、どんな短い空き時間でも行を大きく拡張する。行が拡張されると上下の時間ラベルとカードが近接しすぎる

### 不具合2: 空き時間カードが40px以下の場合でも行を拡張してしまう
- **症状**: 短い空き時間（例: 30分 ≒ 20px相当）でも行高さが変わり、レイアウトが崩れる
- **根本原因**: `getCardH` が slot の実際の時間長さに関係なく固定の大きな高さを返す。`rowHeight` の計算で空き時間カードが常に行を押し広げる

### 不具合3: ドラッグ時のガイド線と時間表示がズレることがある
- **症状**: 青いガイド線の視覚的位置と、右端に表示される時刻バッジの時刻が一致しない
- **現状**: 直前のセッションで `rowCalcY(toMin(dropTime))` 方式に修正済みだが、
  拡張行の中で指が動いたとき `calcTime` が次の時間境界にスナップするため、
  ラインが突然ジャンプして見える可能性がある

### 不具合4: 下方向へドラッグした時の時間ズレ
- **症状**: カードを下方向にドラッグすると、青いラインが示す位置と計算される時刻にズレが生じる
- **根本原因（調査済み）**:
  1. `useEffect` が `touchmove` リスナーを登録するまでの数フレームの間に自然スクロールが発生し `containerDocTop` がずれる
  2. 拡張行の内部では `relY ≠ rowCalcY(T)` となるため、同じ `relY` でも `calcTime` と `rowCalcY` の逆算が一致しない
- **現在の実装**: `dragContainerTopRef` にページ座標を保存、`relY = (clientY + window.scrollY) - containerDocTop` で計算。ラインは `rowCalcY(toMin(dropTime))` で位置決め

---

## 修正済みの内容（このセッションで解決）

| 問題 | 修正内容 |
|------|----------|
| `querySelector('[data-timeline]')` 取得失敗時にフォールバック式で約95分ズレ | `containerRef` + `useLayoutEffect` 方式に変更 |
| ドラッグ開始時の viewport 座標キャッシュが後続スクロールで陳腐化 | ページ座標（`rect.top + scrollY`）で保存し毎 move で `clientY + scrollY` を使用 |
| 青いドロップラインを `fixed` オーバーレイに描画 → viewport/コンテナ座標系不一致 | Timeline コンテナ内部に移動（同一座標系・同一親要素） |
| ライン位置に生の `relY` を使用 → 拡張行で位置ズレ | `rowCalcY(toMin(dropTime))` で時刻から逆算 |
| カードの重なり | `CARD_GAP=12` 導入、`prevBottom + CARD_GAP` フロア保証 |

---

## 触ってはいけない部分

### 座標系ロジック（壊れやすい）
- `rowCalcY` / `calcTime` の計算式
- `dragContainerTopRef` の設定タイミング（`startDrag` の同期処理内）
- `useLayoutEffect` の deps なし設定（毎レンダリング後に同期実行が必要）
- ドロップライン描画を `fixed` オーバーレイに戻してはいけない

### localStorage キー
- `tl-tasks-v2` / `tl-settings-v2` / `tl-shop-v1` のキー名は変えないこと
- スキーマを変える場合はキーバージョンをインクリメントすること

### 単一ファイル制約
- ユーザーから明示的に指示されない限り `page.tsx` を分割しないこと

---

## UIルール

- **言語**: UIラベルはすべて日本語
- **デザイン**: iPhone Safari 向けモバイルファースト（max-width: md = 448px）
- **スタイル**: Tailwind ユーティリティのみ使用（コンポーネントライブラリ禁止）
- **絵文字**: アイコンには絵文字を使用（ICONS 配列定義済み）
- **タッチ**: タップ/長押し/スワイプ中心のインタラクション（マウスは考慮不要）
- **色**:
  - アクティブ・強調: `bg-gray-900 text-white`（黒）
  - ドロップライン: `bg-blue-400 / bg-blue-500`
  - 空き時間カード: `bg-gray-100`
  - 未来のタスク: `text-gray-400`
- **フォント**: system-ui sans-serif（layout.tsx で指定）
- **アニメーション**: Tailwind の `transition-colors` / `scale-95`（長押し中）のみ

---

## 今後の優先順位

### 優先度 高（現在の不具合修正）

1. **不具合2を先に修正**: 空き時間カードの行高さ拡張ロジックを見直す
   - `slot.min * PX_PER_MIN <= BASE_SLOT_HEIGHT`（≤60分）の場合は free card を表示しない or 行を拡張しない
   - これにより不具合1（重なり）も同時に改善される見込み

2. **不具合1の残存を確認**: 2の修正後に重なりが残る場合は、`freeY` 計算に余白を追加

3. **不具合3・4の再確認**: 不具合2の修正後にレイアウトが安定してから再テスト

### 優先度 中（UX改善）

- ドラッグ中の時刻スナップをより滑らかに（拡張行内でのジャンプを減らす）
- 空き時間カードの表示閾値調整（現在 10分以上で表示）
- スワイプ日付切り替えのアニメーション追加

### 優先度 低（新機能）

- タスク完了アニメーション
- 統計・レポート画面
- データエクスポート機能
- ウィジェット連携（iOS ショートカット）

---

## 環境変数

```
GROQ_API_KEY=   # /api/generate (AI投稿生成) のみ必要。メインアプリには不要
```

---

## パターンと注意事項

### 座標系（最もバグが発生しやすい箇所）

```
clientY         = viewport 相対（スクロールで変化）
pageY           = clientY + window.scrollY（ドキュメント相対・スクロール不変）
rect.top        = viewport 相対（変化する）
containerDocTop = rect.top + scrollY（ドキュメント相対・安定）
```

touch イベントとコンテナ内座標を比較するときは **必ずページ座標で計算すること**。

### 拡張行での注意

- `rowHeight > BASE_SLOT_HEIGHT` の行では、`calcTime` は `frac` を1にクランプ → 次の時間境界にスナップ
- 行の下部（BASE を超えた領域）に指があると、その時間帯より早い時刻が返ることがある
- **生の `relY` をライン位置に使ってはいけない** — 必ず `rowCalcY(toMin(time))` を経由すること

### React タイミング

- `useEffect` はペイント後に非同期実行 → `setDragTask` から touchmove リスナー登録まで約1フレームのギャップがある
- `useLayoutEffect`（deps なし）は Timeline 内でレンダリング後に毎回同期実行される

### iOS Safari 固有

- `overscroll-none` でプルリフレッシュを防止
- `-webkit-overflow-scrolling: touch` でモメンタムスクロール
- `maximum-scale=1` でズーム防止
- `navigator.vibrate` はハプティクフィードバック（非対応デバイスでは無視）
- touchmove で `e.preventDefault()` を呼ぶには `{passive: false}` が必須

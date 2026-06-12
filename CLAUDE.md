# CLAUDE.md

このファイルは Claude Code がこのリポジトリで作業する際のガイドです。**新しいセッションでも同じ品質で開発できるよう、現在の実装状態と方針を記述しています。**

---

## プロジェクト概要

**1日タイムライン** — ADHD気質の人やToDoリストが続かない人向けに、今日やることを時間軸で見える化するタイムラインToDoアプリ。

- Next.js 15 (App Router) / TypeScript / Tailwind CSS
- アイコン: `@phosphor-icons/react`（weight="bold"、`AppIcons` で一元管理）
- AI: Groq SDK（llama-3.3-70b-versatile）— Threads投稿生成のみ
- データ永続化: localStorage（サーバーDBなし）
- デプロイ: Vercel（`main` push で自動）

---

## 開発コマンド

```bash
npm run dev     # 開発サーバー（http://localhost:3000）
npm run build   # 本番ビルド
npm run lint    # ESLint
```

テストフレームワークなし。

## 作業完了時の必須手順

```
npm install → npm run build → git add → git commit → git push origin main
```

**node_modules がない状態でビルド確認をせずにコミット・プッシュしないこと。**  
「変更が小さいから大丈夫」という推測でコミットしない。必ずビルドを通してから push する。

Vercel は `main` push で自動デプロイされる。デプロイした場合のみ「デプロイしました」と報告する。

---

## アーキテクチャ

ほぼすべての機能が `src/app/page.tsx` 1ファイルに集約されている（約2930行）。コンポーネント分割は最小限。

```
src/app/
  page.tsx              # アプリ全体（タイムライン・タスク管理・モーダル等）
  layout.tsx            # ルートレイアウト・メタデータ・viewport設定
  globals.css           # グローバルスタイル（font-size: 17px）
  components/
    Icons.tsx           # AppIcons — Phosphor Icons の一元管理
  api/
    generate/
      route.ts          # POST /api/generate — Groq でThreads投稿生成
```

### page.tsx の主要コンポーネント

| 関数 | 役割 |
|---|---|
| `App` | ルートコンポーネント。state管理・localStorage同期・ドラッグ処理 |
| `Timeline` | タイムライン描画。絶対配置で構築 |
| `TaskModal` | タスク作成・編集モーダル（繰り返し設定含む） |
| `TaskCard` | タイムライン上のタスクカード |
| `CompactTaskCard` | 同時刻タスクが複数ある場合のコンパクト表示 |
| `FreeTimeCard` | 空き時間スロットカード |
| `MonthCalendar` | ポップアップ型月間カレンダー |
| `CalendarPage` | フルスクリーン月間カレンダー（タスク一覧付き） |
| `SearchPage` | タスク検索 |
| `BottomTabs` | あとでやる・買い物リストのボトムシート |
| `SettingsScreen` | 設定画面（ファイルタブ管理含む） |

### タイムラインのレイアウト定数（Timeline 内）

以下のセマンティックゾーン定数から AXIS_X・CARD_LEFT を導出している。固定px値を直接書かない。

```typescript
const TIME_LABEL_W = 40;  // px — "HH:MM" が text-xs で収まる幅
const AXIS_GAP     = 4;   // px — ラベルエリアとアイコンの間
const ICON_HALF    = 28;  // px — 56px アイコンカプセルの半分
const CARD_GAP     = 4;   // px — アイコン右端とカード左端の間

const AXIS_X    = TIME_LABEL_W + AXIS_GAP + ICON_HALF;  // 72px
const CARD_LEFT = AXIS_X + ICON_HALF + CARD_GAP;         // 104px
```

- `PX_PER_HOUR` = 40（1時間あたりのピクセル高さ）
- タイムラインは `position: absolute` で各要素を配置
- 時刻→Y座標: `layoutCalcY(min)`
- タッチY→時刻: `yToTimeRef`
- **時刻ラベルはすべて `w-10 text-right pr-1`（40px）で統一**。`w-12` は使わない

---

## 主要な型定義

| 型 | 説明 |
|---|---|
| `Task` | id, name, startTime, duration, memo, icon, completed, date, isLater, recurrence, customRec, pinned, tags, notifications, incompleteReminder, category, postponedCount, color, subtasks |
| `Settings` | wakeTime, sleepTime |
| `FreeSlot` | タイムライン上の空き時間スロット |
| `ShopItem` | 買い物リストのアイテム（7日後に自動削除） |
| `TagDef` | タグ定義（name, color） |
| `CustomRec` | カスタム繰り返し設定 |
| `MoveHistory` | 未完了タスクの「あとでやる」移動履歴 |
| `CustomTab` | ユーザー定義ファイルタブ（`{id:string; name:string}`） |
| `TaskMode` | `'later'` / `'scheduled'` / `'recurring'` |

`Task.subtasks` は `{id:string; name:string; completed:boolean}[]` 型。

## localStorage キー

| 定数 | キー | 内容 |
|---|---|---|
| `TASKS_KEY` | `'tl-tasks-v2'` | タスク一覧 |
| `SETTINGS_KEY` | `'tl-settings-v2'` | 起床・就寝設定 |
| `SHOP_KEY` | `'tl-shop-v1'` | 買い物リスト |
| `TAGS_KEY` | `'tl-tags-v1'` | グローバルタグ定義 |
| `HISTORY_KEY` | `'tl-history-v1'` | 移動履歴 |
| `CUSTOM_TABS_KEY` | `'tl-custom-tabs-v1'` | ユーザー定義ファイルタブ |

---

## 現在のUI実装状態

### ヘッダー

- 日付表示: `2026年6月12日` の1行表示（年→月→日、日本語表記）
- 日付ナビゲーション行（〈 今日 〉）は**削除済み**
- ファイルタブバー（横スクロール対応、ユーザー定義タブ + + ボタン）

### ファイルタブ（カスタムタブ）

メインヘッダーと CalendarPage の両方で**ファイルタブ型**を採用。

- `すべて`（常に先頭）+ ユーザー定義タブ（`CustomTab[]`） + `+` ボタン
- タブをタップ → 未選択なら選択、選択中ならインライン名前編集に入る
- `+` ボタンでタブ追加 → 即インライン編集
- 設定画面の「ファイルタブ」からも名前変更・削除可能
- タブを削除したタスクは自動的に `すべて`（`category: null`）扱いになる

**ファイルタブ型スタイル（共通パターン）：**
```jsx
<div className="flex items-end px-3 pt-2 bg-white"
  style={{borderBottom:'2px solid #e5e7eb',overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
  {([{key:null,label:'すべて'},...customTabs.map(t=>({key:t.id,label:t.name}))]).map(({key,label})=>{
    const active = currentFilter===key;
    return (
      <button key={String(key)} className="shrink-0 relative"
        style={active ? {
          padding:'7px 18px', background:'white', color:'#111827', fontWeight:700, fontSize:'0.875rem',
          border:'2px solid #6b7280', borderBottom:'2px solid white',
          borderRadius:'14px 14px 0 0', marginBottom:'-2px', zIndex:10,
        } : {
          padding:'5px 18px', background:'#f3f4f6', color:'#9ca3af', fontWeight:600, fontSize:'0.875rem',
          border:'none', borderRadius:'14px 14px 0 0',
        }}>{label}</button>
    );
  })}
</div>
```

すべて inline style で実装（Tailwind では `-mb-px` や `border-b-white` 等の表現が難しいため）。

### TaskModal（タスク詳細画面）

ボトムシート型モーダル。上部ダークヘッダー + 下部ホワイトコンテンツの2層構成。

**ダークヘッダー（bg-gray-900）**
- 閉じるボタン（×）
- アイコン + タスク名入力欄
- カテゴリチップ（ユーザー定義タブ）
- モードタブ（あとで／時間指定／繰り返し）
- 右端ボタン: **新規作成時** → `保存` ボタン / **編集時** → 保存ステータス + `完了` ボタン

**新規作成モード（task=null）**
- 名前が空なら `保存` ボタンは disabled
- × ボタンで閉じる際、入力済みなら「入力内容を破棄しますか？」確認ダイアログを表示
- ダイアログはモーダル内 `z-[110]` のオーバーレイで実装

**編集モード（task!=null）**
- 変更を400ms debounce で自動保存（`onUpdate` コールバック経由）
- 保存状態表示: `保存中…` / `✓ 保存済み`（1秒後フェードアウト）/ `保存に失敗しました`
- `完了` ボタン → 未送信のpendingデータを即時フラッシュして閉じる（`flushAndClose`）
- × ボタンも `flushAndClose` を呼ぶ（確認ダイアログなし）

**ホワイトコンテンツ（bg-gray-50）**
1. 繰り返し設定カード（繰り返しモード時のみ）
2. **設定カード**（1枚の白い角丸カード、iOS設定画面スタイル）
   - 日付（時間指定モードのみ）
   - 時間（全モード：laterは所要時間のみ、それ以外は開始時刻+所要時間）
   - アラート（時間指定・繰り返しのみ）
   - タグ（プルダウン形式、全モード）
   - サブタスク入力欄（全モード：later含む）
   - 行間に `h-px bg-gray-100 mx-4` の区切り線
3. **メモカード**（設定カードの下）
4. 削除ボタン（タスク編集時のみ）

**ピン留めは削除済み**（設定カードから除外）。  
**アラートのデフォルト値**：新規タスク作成時は `[0]`（開始時）。

### BottomTabs（あとでやるリスト）

各タスクのアイコン表示はすべて `task.icon` / `task.color` を反映。

```jsx
const Ic = getTaskIcon(t.icon ?? '');
<div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
  style={{background: t.color || '#F3F4F6'}}>
  <Ic size={14} className={t.color ? 'text-gray-600' : 'text-gray-400'}/>
</div>
```

対象：あとでやる通常タスク、あとでやる繰り返しタスク、時間指定グループ、繰り返しグループ。どこに表示されても同じアイコン・色。

### SettingsScreen（設定画面）

`customTabs: CustomTab[]` と `onCustomTabs: (tabs:CustomTab[])=>void` を受け取る。  
サブ画面 `'tabs'` で各タブの名前変更・削除が可能。

設定メニューの並び順：タグ → **ファイルタブ** → 繰り返しタスク → 通知 → 表示設定 → 起床・就寝

---

## アイコン方針

- `src/app/components/Icons.tsx` の `AppIcons` のみ使用する
- `page.tsx` などで Phosphor を直接 import しない
- 新アイコン追加時は `Icons.tsx` の `AppIcons` に追加してから使う

### AppIcons キー一覧

| キー | Phosphor | キー | Phosphor |
|---|---|---|---|
| `calendar` | CalendarBlank | `trash` | Trash |
| `search` | MagnifyingGlass | `stats` | ChartBar |
| `settings` | Gear | `tag` | Tag |
| `wake` | SunHorizon | `bell` | Bell |
| `sleep` | Moon | `palette` | Palette |
| `task` | Note | `link` | LinkSimple |
| `freeTime` | ClockCountdown | `star` | Star |
| `repeat` | ArrowsClockwise | `pin` | PushPin |
| `shopping` | ShoppingCart | `clock` | Clock |
| `postponed` | ArrowCounterClockwise | `caretRight` | CaretRight |
| `question` | Question | `caretLeft` | CaretLeft |
| `smileySad` | SmileySad | `caretDown` | CaretDown |
| `sparkle` | Sparkle | `checkSquare` | CheckSquare |

---

## UIデザイン方針

### 基本方針

- **iOS設定画面 / Structured風**の自然なUIを優先する
- 1枚の白い角丸カードに行を並べ、行間に薄い区切り線を入れる
- 左側にアイコン（Phosphor Icons bold）、右側に値や矢印・スイッチを配置
- 優しい雰囲気を維持する。主張しすぎないデザイン

### フォント・カラー

- ベースフォントサイズ: `17px`（globals.css に設定済み）
- テキスト: `text-gray-800`（primary）、`text-gray-400`（secondary）
- カード背景: `bg-white`、アプリ背景: `bg-gray-50`
- アクセント: `bg-gray-900`（ボタン・選択中状態）

### タップ項目の標準スタイル

```jsx
<button className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50">
  <AppIcons.XXX size={18} className="text-gray-400 shrink-0"/>
  <span className="flex-1 text-left text-sm font-medium text-gray-800">ラベル</span>
  <AppIcons.caretRight size={14} className="text-gray-300"/>
</button>
```

### 区切り線の標準スタイル

```jsx
<div className="h-px bg-gray-100 mx-4"/>
```

### 避けるデザイン

- `rounded-full` のカプセル型ボタンをメインナビに使わない（タグ選択等の補助UIは可）
- 余白が広すぎる・カードが多すぎて縦に長くなる設計
- 見た目が変わらない微調整だけで終わらせる（構造から変えること）
- グラデーション、アニメーション過多、過度な影
- 既存のデザインパターンを無視した突発的なスタイル追加
- タイムライン時刻ラベルに `w-12`（48px）を使う（`w-10` で統一）

---

## 開発ルール

### 修正前の確認

**必ず現在の実装を Read/Grep で確認してから変更する。** 既存コードを見ずに書き直さない。  
関連する定数・型・コンポーネントを grep で把握してから手を入れる。

### 変更の原則

1. **必要最小限の変更のみ**行う — 関係ない箇所は触らない
2. **既存コンポーネントを流用**することを優先する — 新しく作る前に既存を確認
3. **大規模リファクタリングを避ける**（約2930行の1ファイル構成は意図的）
4. 不要なリファクタリング・抽象化・コメントアウトは行わない
5. 見た目が変わらない微調整だけで終わらせない — 効果が見える変更にする
6. iOS設定画面やStructured風の**自然なUI**を優先する
7. **新しいセッションでも同じ品質で開発できる**ことを重視する
8. 小さく直す — 1つのリクエストで1箇所だけ変える

### コードスタイル

- コメントは WHY が非自明な場合のみ書く
- 型安全を保つ（`any` 禁止）
- Tailwind クラスは既存パターンに合わせる
- inline style は Tailwind で表現できない場合のみ使う

---

## 環境変数

| 変数 | 説明 |
|---|---|
| `GROQ_API_KEY` | Groq APIキー（Threads投稿生成で使用） |

---

## 開発上の注意

- ドラッグ＆ドロップはタッチイベントで実装（長押し500ms → vibrate → drag開始）
- 繰り返しタスクは `generateCustomDates()` で将来日程を生成し、`tasks` に展開して保存
- 「あとでやる」タスクは `isLater: true`、日付をまたいで持ち越し可能
- スマートフォン最適化済み（`userScalable: false`、`overscroll-none`）
- タイムラインの横レイアウトはセマンティックゾーン定数（`TIME_LABEL_W` 等）で管理。機種ごとに固定px調整しない

---

## Vercel / Git 運用

- `main` branch への push で Vercel が自動デプロイ
- feature branch は `claude/xxx` 形式
- 作業完了後は必ず `npm run build` → `git push origin main`
- **作業ブランチから main にマージ・push するまでデプロイされない**
- リモートが進んでいる場合は `git pull origin main --rebase` してから push
- push は `git push -u origin <branch>` を使う

---

## Response Policy

### Token Efficiency (High Priority)

#### デフォルト動作

- 必要最小限の変更のみ行う
- 不要なリファクタリングは行わない
- 実装を優先し、説明は最小限にする

#### 原則

ユーザーから明示的に求められない限り、以下は行わない。

- 原因分析・修正方針の説明
- コードブロックでの報告
- 変更内容の要約・ファイル一覧の報告
- 詳細な完了報告
- 途中経過・進捗報告・Step ごとの説明

#### デプロイ

デプロイを実行した場合のみ、簡潔に報告する。

例：「デプロイしました。」

デプロイ状況だけは省略しない。

Token efficiency is more important than detailed explanations.
Do the work first. Explain only when asked.
Always report deployment status if deployment was performed.

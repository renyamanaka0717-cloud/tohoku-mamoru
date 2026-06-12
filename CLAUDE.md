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

## 作業完了時の手順

```
npm run build → git add → git commit → git push origin main
```

Vercel は `main` push で自動デプロイされる。デプロイした場合のみ「デプロイしました」と報告する。

---

## アーキテクチャ

ほぼすべての機能が `src/app/page.tsx` 1ファイルに集約されている（2700行超）。コンポーネント分割は最小限。

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
| `Timeline` | タイムライン描画。`AXIS_X` / `CARD_LEFT` の絶対配置で構築 |
| `TaskModal` | タスク作成・編集モーダル（繰り返し設定含む） |
| `TaskCard` | タイムライン上のタスクカード |
| `CompactTaskCard` | 同時刻タスクが複数ある場合のコンパクト表示 |
| `FreeTimeCard` | 空き時間スロットカード |
| `MonthCalendar` | ポップアップ型月間カレンダー |
| `CalendarPage` | フルスクリーン月間カレンダー（タスク一覧付き） |
| `SearchPage` | タスク検索 |
| `BottomTabs` | あとでやる・買い物リストのボトムシート |
| `SettingsScreen` | 設定画面 |

### タイムラインのレイアウト定数（Timeline 内）

| 定数 | 値 | 説明 |
|---|---|---|
| `PX_PER_HOUR` | 40 | 1時間あたりのピクセル高さ |
| `AXIS_X` | 60 | 縦軸線のX座標（px） |
| `CARD_LEFT` | 72 | タスクカード左端のX座標（px） |

タイムラインは `position: absolute` で各要素を配置。時刻→Y座標の変換は `layoutCalcY(min)`、タッチY座標→時刻は `yToTimeRef`。

---

## 主要な型定義

| 型 | 説明 |
|---|---|
| `Task` | id, name, startTime, duration, memo, icon, completed, date, isLater, recurrence, customRec, pinned, tags, notifications, incompleteReminder, category, postponedCount, color, **subtasks** |
| `Settings` | wakeTime, sleepTime |
| `FreeSlot` | タイムライン上の空き時間スロット |
| `ShopItem` | 買い物リストのアイテム（7日後に自動削除） |
| `TagDef` | タグ定義（name, color） |
| `CustomRec` | カスタム繰り返し設定 |
| `MoveHistory` | 未完了タスクの「あとでやる」移動履歴 |
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

---

## 現在のUI実装状態

### TaskModal（タスク詳細画面）

ボトムシート型モーダル。上部ダークヘッダー + 下部ホワイトコンテンツの2層構成。

**ダークヘッダー（bg-gray-900）**
- 閉じるボタン（×）
- アイコン + タスク名入力欄
- カテゴリチップ（個人／仕事）
- モードタブ（あとで／時間指定／繰り返し）

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

**ピン留めは現在削除済み**（設定カードから除外）。

**アラートのデフォルト値**：新規タスク作成時は `[0]`（開始時）。

### カテゴリフィルタータブ

メインヘッダーと CalendarPage の両方で**ファイルタブ型**を採用。

- `すべて` / `個人` / `仕事`
- 選択中タブ: `bg-white`、上・左・右にボーダー（`2px solid #6b7280`）、`borderBottom: '2px solid white'` で下線を隠す、`borderRadius: '14px 14px 0 0'`、`marginBottom: '-2px'`、`zIndex: 10`
- 未選択タブ: `bg-gray-100`、ボーダーなし、`borderRadius: '14px 14px 0 0'`（同じ角丸で統一）
- コンテナ: `borderBottom: '2px solid #e5e7eb'`
- すべて inline style で実装（Tailwind では `-mb-px` や `border-b-white` 等の表現が難しいため）

**実装パターン（両方の場所で共通）：**
```jsx
<div className="flex items-end px-3 pt-2 bg-white" style={{borderBottom:'2px solid #e5e7eb'}}>
  {tabs.map(({key,label})=>{
    const active = currentFilter===key;
    return (
      <button key={...} onClick={...} className="shrink-0 relative"
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

---

## 開発ルール

### 修正前の確認

**必ず現在の実装を Read/Grep で確認してから変更する。** 既存コードを見ずに書き直さない。

### 変更の原則

1. **必要最小限の変更のみ**行う — 関係ない箇所は触らない
2. **既存コンポーネントを流用**することを優先する — 新しく作る前に既存を確認
3. **大規模リファクタリングを避ける**（2700行の1ファイル構成は意図的）
4. 不要なリファクタリング・抽象化・コメントアウトは行わない
5. 見た目が変わらない微調整だけで終わらせない — 効果が見える変更にする
6. iOS設定画面やStructured風の**自然なUI**を優先する
7. **新しいセッションでも同じ品質で開発できる**ことを重視する

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

---

## Vercel / Git 運用

- `main` branch への push で Vercel が自動デプロイ
- feature branch は `claude/xxx` 形式
- 作業完了後は必ず `git push origin main`
- **作業ブランチから main にマージ・push するまでデプロイされない**
- リモートが進んでいる場合は `git pull origin main --rebase` してから push

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

#### デプロイ

デプロイを実行した場合のみ、簡潔に報告する。

例：「デプロイしました。」

デプロイ状況だけは省略しない。

Token efficiency is more important than detailed explanations.
Do the work first. Explain only when asked.
Always report deployment status if deployment was performed.

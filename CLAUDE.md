# CLAUDE.md

このファイルは Claude Code がこのリポジトリで作業する際のガイドです。**新しいセッションでも同じ品質で開発できるよう、現在の実装状態と方針を記述しています。**

---

## プロジェクト概要

**1日タイムライン** — ADHD気質の人やToDoリストが続かない人向けに、今日やることを時間軸で見える化するタイムラインToDoアプリ。

- Next.js 15 (App Router) / TypeScript / Tailwind CSS
- アイコン: `@phosphor-icons/react`（weight="bold"、`AppIcons` で一元管理）
- AI: Groq SDK（llama-3.3-70b-versatile）— Threads投稿生成のみ
- データ永続化: localStorage（サーバーDBなし）
- デプロイ: Vercel（`main` または `claude/**` push で GitHub Actions 経由で自動デプロイ）

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
npm run build → git add → git commit → git push origin main
```

**node_modules がない状態でビルド確認をせずにコミット・プッシュしないこと。**  
「変更が小さいから大丈夫」という推測でコミットしない。必ずビルドを通してから push する。

Vercel は `main` push で自動デプロイされる。デプロイした場合のみ「デプロイしました」と報告する。

---

## アーキテクチャ

ほぼすべての機能が `src/app/page.tsx` 1ファイルに集約されている（約3230行）。コンポーネント分割は最小限。

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
.github/
  workflows/
    deploy.yml          # main / claude/** push → Vercel deploy hook 呼び出し
```

### page.tsx の主要コンポーネント

| 関数 | 役割 |
|---|---|
| `App` | ルートコンポーネント。state管理・localStorage同期・ドラッグ処理 |
| `Timeline` | タイムライン描画。絶対配置で構築 |
| `TaskModal` | タスク作成・編集モーダル（繰り返し設定・写真添付含む） |
| `TaskCard` | タイムライン上のタスクカード（サブタスク・メモ・写真プルダウン付き） |
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
const AXIS_GAP     = 12;  // px — ラベルエリアとアイコンの間
const ICON_HALF    = 28;  // px — 56px アイコンカプセルの半分
const CARD_GAP     = 8;   // px — アイコン右端とカード左端の間

const AXIS_X    = TIME_LABEL_W + AXIS_GAP + ICON_HALF;  // 80px
const CARD_LEFT = AXIS_X + ICON_HALF + CARD_GAP;         // 116px
```

- `PX_PER_HOUR` = 40（1時間あたりのピクセル高さ）
- タイムラインは `position: absolute` で各要素を配置
- 時刻→Y座標: `layoutCalcY(min)`
- タッチY→時刻: `yToTimeRef`（ピースワイズ補間、クランプ範囲は 0〜23:55）
- **時刻ラベルはすべて `w-10 text-right pr-1`（40px）で統一**。`w-12` は使わない
- 縦軸線: `left:${AXIS_X}px, width:'2px', bg-gray-200, transform:'translateX(-0.5px)'`

### タイムラインのカード高さ計測（ResizeObserver）

タスクカードの実際の高さを ResizeObserver で計測し、重なりを防ぐ。

```typescript
// Timeline内
const [measuredH,setMeasuredH] = useState<Record<string,number>>({});
const roRef = useRef<ResizeObserver|null>(null);
// roRef.current は data-gk 属性（startTime）をキーにカード高さを記録
// 単一タスクグループのカードに ref + data-gk を付与して observe
```

レイアウト計算では `measuredH[startTime] ?? MIN_CARD_H` を使い、カードの実際の高さに基づいてアイコンカプセルの高さも同期する。

---

## 主要な型定義

| 型 | 説明 |
|---|---|
| `Task` | id, name, startTime, duration, memo, icon, completed, date, isLater, recurrence, customRec, pinned, tags, notifications, incompleteReminder, category, postponedCount, color, subtasks, photoCount |
| `Settings` | wakeTime, sleepTime |
| `FreeSlot` | タイムライン上の空き時間スロット |
| `ShopItem` | 買い物リストのアイテム（7日後に自動削除） |
| `TagDef` | タグ定義（name, color） |
| `CustomRec` | カスタム繰り返し設定 |
| `MoveHistory` | 未完了タスクの「あとでやる」移動履歴 |
| `CustomTab` | ユーザー定義ファイルタブ（`{id:string; name:string}`） |
| `TaskMode` | `'later'` / `'scheduled'` / `'recurring'` |

`Task.subtasks` は `{id:string; name:string; completed:boolean}[]` 型。  
`Task.photoCount` は添付写真枚数（写真データ本体は `PHOTOS_KEY` に別途保存）。

## localStorage キー

| 定数 | キー | 内容 |
|---|---|---|
| `TASKS_KEY` | `'tl-tasks-v2'` | タスク一覧 |
| `SETTINGS_KEY` | `'tl-settings-v2'` | 起床・就寝設定（グローバル） |
| `DAY_SETTINGS_KEY` | `'tl-day-settings-v1'` | 日別の起床・就寝オーバーライド |
| `SHOP_KEY` | `'tl-shop-v1'` | 買い物リスト |
| `TAGS_KEY` | `'tl-tags-v1'` | グローバルタグ定義 |
| `HISTORY_KEY` | `'tl-history-v1'` | 移動履歴 |
| `CUSTOM_TABS_KEY` | `'tl-custom-tabs-v1'` | ユーザー定義ファイルタブ |
| `PHOTOS_KEY` | `'tl-photos-v1'` | タスクIDをキーとした写真データ（base64） |

---

## 現在のUI実装状態

### カラーシステム

| 役割 | 値 | 用途 |
|---|---|---|
| メインアクセント | `#7FAE8C` | ファイルタブ背景・選択状態・FAB・バッジ・並び替えボタン |
| ソフトレッド | `#D97A7A` | 削除・エラー・日曜日テキスト |
| プライマリ黒 | `#1F1F1F` | アクティブタブテキスト・重要ラベル |
| アンバー | `#E6B85C` | 注意・期限間近（将来用途） |
| テキスト主 | `text-gray-800` | 通常テキスト |
| テキスト副 | `text-gray-400` | サブテキスト・ラベル |

`bg-gray-900` はTaskModalのヘッダー等で残存しているが、アクセントカラーとしては `#7FAE8C` を使う。

### ヘッダー

- 日付表示: `2026年6月13日` の1行表示（年→月→日、日本語表記）
- 日付ナビゲーション行（〈 今日 〉）は**削除済み**
- 1週間カレンダー（日〜土）: 曜日13px・日付20px、縦余白を引き締めたコンパクト表示
- **週スワイプ**: 1週間カレンダーを左右スワイプ（dx>50px かつ縦より横が大きい）→ ±7日移動
- ファイルタブバー（横スクロール対応、ユーザー定義タブ + `+` ボタン）

### ファイルタブ（カスタムタブ）

メインヘッダーと CalendarPage の両方で**ファイルタブ型**を採用。

- `すべて`（常に先頭）+ ユーザー定義タブ（`CustomTab[]`） + `+` ボタン
- タブをタップ → 未選択なら選択、選択中ならインライン名前編集に入る
- `+` ボタンでタブ追加 → 即インライン編集
- 設定画面の「ファイルタブ」からも名前変更・削除可能
- タブを削除したタスクは自動的に `すべて`（`category: null`）扱いになる

**ファイルタブ型スタイル（現在の実装）：**
```jsx
<div className="bg-[#7FAE8C]">
  <div className="flex items-end px-3 pt-2" style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
    {tabs.map(({key,label})=>{
      const active = currentFilter===key;
      return (
        <button key={String(key)} className="shrink-0 relative"
          style={active ? {
            padding:'7px 18px 9px', background:'white', color:'#1F1F1F', fontWeight:700, fontSize:'0.875rem',
            border:'none', borderRadius:'14px 14px 0 0', marginBottom:'-2px', zIndex:10,
          } : {
            padding:'5px 18px', background:'rgba(0,0,0,0.12)', color:'rgba(255,255,255,0.88)', fontWeight:600, fontSize:'0.875rem',
            border:'none', borderRadius:'14px 14px 0 0', marginBottom:'2px',
          }}>{label}</button>
      );
    })}
  </div>
</div>
```

- 外枠（`bg-[#7FAE8C]`）がタブバーの背景色
- アクティブタブは白背景・`marginBottom:'-2px'`・zIndex:10 で浮き出し
- 非アクティブタブは `rgba(0,0,0,0.12)` 半透明黒の背景
- すべて inline style で実装（Tailwind では `-mb-px` 等の表現が難しいため）
- `+` ボタンは `text-white/70`

### TaskCard

タイムライン上のタスクカード。下部にアイコン行を持つ。

**アイコン行（hasIcons = サブタスクあり OR メモあり OR 写真あり）**

```jsx
<div className="flex items-center gap-2 mt-2">
  {/* サブタスク進捗カプセル（サブタスクありの場合） */}
  <button onClick={e=>{e.stopPropagation();setOpenPanel(p=>p==='subtask'?null:'subtask');}}
    className="inline-flex items-center gap-2 bg-gray-100 rounded-2xl px-3 active:bg-gray-200"
    style={{height:'32px'}}>
    <AppIcons.checkSquare size={13}/>
    <span>{doneCount}/{subtasks.length}</span>
    <span style={openPanel==='subtask'?{transform:'rotate(90deg)',...}:{...}}>
      <AppIcons.caretRight size={12}/>
    </span>
  </button>
  {/* メモアイコン（メモありの場合） */}
  <button onClick={e=>{e.stopPropagation();setOpenPanel(p=>p==='memo'?null:'memo');}}
    className="inline-flex items-center justify-center bg-gray-100 rounded-xl active:bg-gray-200"
    style={{width:'32px',height:'32px'}}>
    <AppIcons.task size={14}/>
  </button>
  {/* カメラアイコン（写真ありの場合）→ タップで詳細画面の写真欄へスクロール */}
  <button onClick={e=>{e.stopPropagation();onCameraClick?.();}}
    className="flex items-center justify-center active:opacity-70"
    style={{width:'24px',height:'32px'}}>
    <AppIcons.camera size={13}/>
  </button>
</div>
```

- `openPanel: 'subtask' | 'memo' | null` — 排他的プルダウン。どちらか1つのみ展開
- カメラアイコンをタップ → `onCameraClick()` → TaskModal を写真欄スクロール付きで開く

**TaskCard のプロップス:**
```typescript
{task, onToggle, onEdit, globalTags, onSubtaskToggle?, onCameraClick?}
```

### TaskModal（タスク詳細画面）

ボトムシート型モーダル。上部ダークヘッダー + 下部ホワイトコンテンツの2層構成。

**ダークヘッダー（`bg-[#7FAE8C] rounded-t-3xl`）**
- 閉じるボタン（×）
- アイコン + タスク名入力欄
- カテゴリチップ（ユーザー定義タブ）
- モードタブ（あとで／時間指定／繰り返し）
- 右端ボタン: **新規作成時** → `保存` ボタン / **編集時** → 保存ステータス + `完了` ボタン

**新規作成モード（task=null）**
- 名前が空なら `保存` ボタンは disabled
- × ボタンで閉じる際、入力済みなら「入力内容を破棄しますか？」確認ダイアログを表示

**編集モード（task!=null）**
- 変更を400ms debounce で自動保存（`onUpdate` コールバック経由）
- 保存状態表示: `保存中…` / `✓ 保存済み`（1秒後フェードアウト）/ `保存に失敗しました`
- `完了` ボタン → 未送信のpendingデータを即時フラッシュして閉じる（`flushAndClose`）

**ホワイトコンテンツ（bg-gray-50、`max-h-[55vh] overflow-y-auto`）**
1. 繰り返し設定カード（繰り返しモード時のみ）
2. **設定カード**（1枚の白い角丸カード、iOS設定画面スタイル）
   - 日付（時間指定モードのみ）
   - 時間（全モード：laterは所要時間のみ、それ以外は開始時刻+所要時間）
   - アラート（時間指定・繰り返しのみ）
   - タグ（プルダウン形式、全モード）
   - サブタスク入力欄（全モード：later含む）
   - 行間に `h-px bg-gray-100 mx-4` の区切り線
3. **メモカード**（textarea、bg-white mx-3 mt-3 rounded-2xl）
4. **写真カード**（`ref={photoSectionRef}`、bg-white mx-3 mt-3 rounded-2xl p-4）
   - 最大3枚、Canvas API で圧縮（max 800px、JPEG quality 0.7）
   - `scrollToPhotos` prop が true の場合、マウント後に写真欄へ自動スクロール
5. 削除ボタン（タスク編集時のみ）

**ピン留めは削除済み**（設定カードから除外）。  
**アラートのデフォルト値**：新規タスク作成時は `[0]`（開始時）。

**TaskModal のプロップス:**
```typescript
{task, currentDate, prefillTime?, prefillCategory?, openIconSheet?, scrollToPhotos?,
 onSave, onUpdate?, onDelete?, onClose, globalTags, customTabs}
```

### 起床・就寝カード（Timeline 内）

- 長押し 500ms → vibrate → ドラッグで時間変更
- ドラッグ終了時に確認ポップアップ（この日のみ変更 / すべての日に適用 / キャンセル）
- **この日のみ変更** → `dayOverrides[date]` に保存（`DAY_SETTINGS_KEY`）
- **すべての日に適用** → グローバル `settings` を更新（`SETTINGS_KEY`）
- タイムラインには `effectiveSettings`（グローバル + 日別オーバーライドをマージ）を渡す

### ドラッグ＆ドロップ（タスク移動）

- 長押し 500ms → vibrate → drag 開始
- ドロップ時刻のクランプは**起床・就寝時間に縛られない**（0:00〜23:55 の全時間帯に配置可）
- `yToTimeRef` でタッチY座標→時刻変換（ピースワイズアンカー補間）

### BottomTabs（あとでやる・買い物リスト）

iOS ボトムシートスタイル。フルスクリーンオーバーレイ＋シート本体の2層構成。

**構造:**
```jsx
{/* オーバーレイ — タップで閉じる */}
<div className="fixed inset-0 z-50 flex flex-col bg-black/20" onClick={onClose}>
  <div className="flex-1"/>
  {/* シート本体 */}
  <div className="bg-white w-full max-w-md mx-auto rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl"
    onClick={e=>e.stopPropagation()}
    onTouchStart={...} onTouchEnd={onSheetSwipe}>
    {/* ハンドルバー — タップ/下スワイプで閉じる */}
    <button onClick={onClose} className="flex items-center justify-center pt-3 pb-2 w-full shrink-0 active:opacity-60">
      <div className="w-12 h-1.5 bg-gray-300 rounded-full"/>
    </button>
    {/* タブバー */}
    <div className="flex border-b border-gray-100 shrink-0 mt-1">
      {/* activeTab に応じて border-[#7FAE8C] / border-transparent で下線切替 */}
    </div>
    {/* コンテンツ — CSS Grid stacking で高さ固定 */}
    <div className="flex-1 overflow-hidden" style={{display:'grid',gridTemplateColumns:'1fr',gridTemplateRows:'1fr'}}>
      <div className={`... ${activeTab==='later'?'':'invisible pointer-events-none'}`} style={{gridArea:'1/1'}}>
        {/* あとでやるコンテンツ — 常にDOMに存在 */}
      </div>
      <div className={`... ${activeTab==='shop'?'':'invisible pointer-events-none'}`} style={{gridArea:'1/1'}}>
        {/* 買い物リストコンテンツ — 常にDOMに存在 */}
      </div>
    </div>
  </div>
</div>
```

**閉じる操作:**
- オーバーレイタップ → 閉じる
- ハンドルバータップ → 閉じる
- 下スワイプ（dy>60px かつ縦が横より大きい）→ 閉じる

**タブ切替スワイプ:**
- 左スワイプ（dx>70px かつ横が縦より大きい）→ 買い物リストへ
- 右スワイプ → あとでやるへ

**CSS Grid stacking の意図:**  
両タブを常にDOMに保持し、`visibility:hidden` で非表示にすることでタブ切替時の高さ変化を防ぐ。`display:none` にすると高さがゼロになりレイアウトが崩れる。

**タスクカードのレイアウト（時間が上、名前が下）:**
```jsx
<div className="flex-1 min-w-0" onClick={()=>onEdit(t)}>
  {/* 時間・日付を上段に表示 */}
  <p className="text-xs text-gray-400">{/* 時間 or 繰り返しラベル */}</p>
  {/* タスク名を下段に表示 */}
  <p className="text-sm font-semibold text-gray-900">{t.name}</p>
</div>
```

**並び替えボタン（3ステート）:**
```jsx
<button onClick={()=>setSortDir(d=>d===null?'asc':d==='asc'?'desc':'asc')}
  className="w-8 h-8 rounded-xl flex items-center justify-center text-sm bg-[#7FAE8C] text-white">
  {sortDir===null?'↑↓':sortDir==='asc'?'↑':'↓'}
</button>
```
- `null`（初期）: `↑↓` 表示、ソートなし（登録順）
- `'asc'`: `↑` 表示、昇順
- `'desc'`: `↓` 表示、降順
- あとでやる・買い物リストそれぞれに独立した state（`sortDir` / `shopSortDir`）

### Bottom Bar（画面下部のナビゲーションバー）

```jsx
<div className="fixed bottom-0 left-0 right-0 z-40 max-w-md mx-auto bg-white rounded-t-2xl"
  style={{boxShadow:'0 -4px 16px rgba(0,0,0,0.10)'}}>
  {/* あとでやる | 買い物リスト の2ボタン */}
</div>
```

- 上端角丸（`rounded-t-2xl`）、薄い影（`0 -4px 16px rgba(0,0,0,0.10)`）
- バッジは `bg-[#7FAE8C] text-white rounded-full`
- 上スワイプ（dy>30px）で `あとでやる` タブを開く

### FAB（タスク追加ボタン）

```jsx
<div className="fixed bottom-16 right-4 z-50">
  <button className="w-14 h-14 bg-[#7FAE8C] text-white rounded-full shadow-2xl active:bg-gray-700">
    <AppIcons.plus size={28}/>
  </button>
</div>
```

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
| `camera` | Camera | `plus` | Plus |
| `food` | ForkKnife | `clean` | Broom |
| `work` | Briefcase | `travel` | Car |
| `rest` | Coffee | `music` | MusicNote |
| `book` | Book | `exercise` | Barbell |
| `health` | Heart | `phone` | Phone |
| `home` | House | `study` | GraduationCap |
| `money` | Wallet | `game` | GameController |

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
- **メインアクセント**: `#7FAE8C`（セージグリーン）— ファイルタブ背景・FAB・選択状態・バッジ
- **削除・エラー**: `#D97A7A`（ソフトレッド）
- **プライマリ黒**: `#1F1F1F`（アクティブタブ文字）

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
- ファイルタブに `#e5e7eb` や `#6b7280` の枠線を使う（現在は `bg-[#7FAE8C]` 背景で統一）
- `bg-gray-900` を新たなアクセントカラーとして使う（既存のTaskModalヘッダー等はそのまま）

---

## 開発ルール

### 修正前の確認（最重要）

**必ず現在の実装を Read/Grep で確認してから変更する。** 既存コードを見ずに書き直さない。  
関連する定数・型・コンポーネントを grep で把握してから手を入れる。  
「こうなっているはず」という推測で変更しない。

### 変更の原則

1. **必要最小限の変更のみ**行う — 関係ない箇所は触らない
2. **既存コンポーネントを流用**することを優先する — 新しく作る前に既存を確認
3. **大規模リファクタリングを避ける**（約3230行の1ファイル構成は意図的）
4. 不要なリファクタリング・抽象化・コメントアウトは行わない
5. **見た目が変わらない微調整だけで終わらせない** — 効果が見える変更にする
6. iOS設定画面やStructured風の**自然なUI**を優先する
7. **新しいセッションでも同じ品質で開発できる**ことを重視する
8. **小さく直す** — 1つのリクエストで1箇所だけ変える

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
- 写真データ（base64）は `PHOTOS_KEY` に `{[taskId]: string[]}` 形式で保存。タスク削除時は必ずクリーンアップ
- BottomTabs のタブパネルは `visibility:hidden` + `pointer-events:none` で非表示にする（`display:none` にするとレイアウト崩れ）

---

## Vercel / Git 運用

- `main` または `claude/**` branch への push で **GitHub Actions** が Vercel deploy hook を呼び出して自動デプロイ
  - `.github/workflows/deploy.yml` — `on: push: branches: [main, 'claude/**']`
  - `curl -s -X POST "${{ secrets.VERCEL_DEPLOY_HOOK }}"` で deploy hook を呼び出す
  - deploy hook URL は GitHub リポジトリの `VERCEL_DEPLOY_HOOK` シークレットに設定済み
- セッション指定のブランチが `claude/xxx` 形式の場合はそのブランチへ push すれば自動デプロイされる
- 作業完了後は必ず `npm run build` → `git push -u origin <branch>`
- リモートが進んでいる場合は `git pull origin <branch> --rebase` してから push
- **push すればセッションブランチ・main どちらでも自動デプロイされる**

### ブランチ運用の注意

**セッション開始時の確認（必須）:**

新しいセッションが始まったら、まず以下を確認する:

```bash
git log --oneline origin/main -5   # main の最新状態を確認
git log --oneline HEAD -5          # 現在のブランチを確認
```

ローカルの HEAD が `origin/main` より古い場合は、作業前に必ず pull する:

```bash
git fetch origin
git reset --hard origin/main
```

**diverge の対処:**

セッションブランチと `main` が diverge した場合はリモート `main` に直接 push する:

```bash
git push origin main
```

セッションブランチを main に合わせる場合（force push）:

```bash
git push origin main:<セッションブランチ名> --force
```

**ソースオブトゥルース: `main` ブランチが常に最新。** すべての作業完了後は必ず `origin/main` に push する。セッションブランチへの push は自動デプロイのためだが、内容は main と同じにする。

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

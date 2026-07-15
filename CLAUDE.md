# CLAUDE.md

このファイルは Claude Code がこのリポジトリで作業する際のガイドです。**新しいセッションでも同じ品質で開発できるよう、現在の実装状態と方針を記述しています。**

---

## プロジェクト概要

**BrainBox** — ADHD気質の人やToDoリストが続かない人向けに、今日やることを時間軸で見える化するタイムラインToDoアプリ。App Store にて「BrainBox」名義で配信中。

- Next.js 15 (App Router) / TypeScript / Tailwind CSS
- アイコン: `@phosphor-icons/react`（weight="bold"、`AppIcons` で一元管理）
- AI: Groq SDK（llama-3.3-70b-versatile）— Threads投稿生成のみ
- データ永続化: localStorage（サーバーDBなし）
- デプロイ: Vercel（`main` または `claude/**` push で GitHub Actions 経由で自動デプロイ）
- iOS ネイティブ: Capacitor v8（WKWebView）でラップし App Store 配信
- 課金: RevenueCat（`@revenuecat/purchases-capacitor` v13）— 月額¥200 PRO サブスクリプション

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
npm run build → git add → git commit → git push origin HEAD:main
```

**node_modules がない状態でビルド確認をせずにコミット・プッシュしないこと。**  
「変更が小さいから大丈夫」という推測でコミットしない。必ずビルドを通してから push する。

Vercel は `main` push で自動デプロイされる。デプロイした場合のみ「デプロイしました」と報告する。

---

## アーキテクチャ

ほぼすべての機能が `src/app/page.tsx` 1ファイルに集約されている（約3400行）。コンポーネント分割は最小限。

```
src/app/
  page.tsx              # アプリ全体（タイムライン・タスク管理・モーダル等）
  layout.tsx            # ルートレイアウト・メタデータ・viewport設定
  globals.css           # グローバルスタイル（font-size: 17px、html背景色 #F9FAFB）
  components/
    Icons.tsx           # AppIcons — Phosphor Icons の一元管理
    Premium.tsx         # PremiumProvider・usePremium・PremiumFeatureGate — RevenueCat 連携
  api/
    generate/
      route.ts          # POST /api/generate — Groq でThreads投稿生成
.github/
  workflows/
    deploy.yml          # main / claude/** push → Vercel deploy hook 呼び出し（レスポンスをログ出力）
capacitor.config.js     # iOS ネイティブ設定（backgroundColor:'#F9FAFB', contentInset:'never'）
ios/                    # Capacitor iOS プロジェクト（Xcode）
```

### page.tsx の主要コンポーネント

| 関数 | 役割 |
|---|---|
| `App` | ルートコンポーネント。state管理・localStorage同期・ドラッグ処理 |
| `Timeline` | タイムライン描画。絶対配置で構築 |
| `TaskModal` | タスク作成・編集モーダル（繰り返し設定・写真添付含む） |
| `TaskCard` | タイムライン上のタスクカード（サブタスク・メモ・写真プルダウン付き） |
| `FreeTimeCard` | 空き時間スロットカード |
| `MonthCalendar` | ポップアップ型月間カレンダー |
| `CalendarPage` | フルスクリーン月間カレンダー（タスク一覧付き） |
| `SearchPage` | タスク検索（タスク名・メモ・タグ名で検索可） |
| `BottomTabs` | あとでやる・買い物リストのボトムシート |
| `SettingsScreen` | 設定画面（ファイルタブ管理含む） |

> `CompactTaskCard` はコード内に定義されているが現在は使用されていない（dead code）。同一時刻タスクの表示には `TaskCard` ＋ 独自の連結アイコンスタックを使う。

### タイムラインのレイアウト定数（Timeline 内）

以下のセマンティックゾーン定数から AXIS_X・CARD_LEFT を導出している。固定 px 値を直接書かない。

```typescript
const TIME_LABEL_W = 40;  // px — "HH:MM" が text-xs で収まる幅
const AXIS_GAP     = 12;  // px — ラベルエリアとアイコンの間
const ICON_HALF    = 28;  // px — 56px アイコンカプセルの半分
const CARD_GAP     = 8;   // px — アイコン右端とカード左端の間

const AXIS_X    = TIME_LABEL_W + AXIS_GAP + ICON_HALF;  // 72px
const CARD_LEFT = AXIS_X + ICON_HALF + CARD_GAP;         // 108px
```

- `PX_PER_HOUR` = 40（1時間あたりのピクセル高さ）
- タイムラインは `position: absolute` で各要素を配置
- **時刻ラベルはすべて `w-10 text-right pr-1`（40px）で統一**。`w-12` は使わない
- 縦軸線: `left:${AXIS_X}px, width:'2px', bg-gray-200, transform:'translateX(-0.5px)'`

### タイムラインのY座標計算（重要）

起床〜就寝のあいだのカード（タスク群・空き時間カード）は**実時刻ではなく完全に詰めて配置**する。各カードは直前カードの下端から `CARD_GAP_MIN=16px` の位置に置かれる（時刻の差は無視される）。空き時間カードの縦幅も時刻の長さではなく、あとでやるリストを全部表示した時の最小サイズ（`calcFreeContentH`）で決まる。

詰めて配置すると「実時刻」と「画面上のY座標」の対応が線形ではなくなるため、両者を結ぶのが `anchors`（各カードの実際の開始時刻と、詰めた結果のtop Yのペアの配列）と、それを区分線形補間する `layoutCalcY`。

```typescript
type Anchor = {min:number; y:number};
const anchors: Anchor[] = [...]; // 起床・各カード・就寝の (実時刻, 詰めたY) を時刻順に記録

// 区分線形補間：実時刻 → 詰めたレイアウト上のY座標
const layoutCalcY = (min:number): number => { /* anchors 間を線形補間 */ };

// layoutCalcY のスクリーン座標版（ドラッグ用）
layoutYRef.current = (min:number) => el.getBoundingClientRect().top + layoutCalcY(min);

// 逆引き：スクリーンY → 実時刻（anchors の逆方向の区分線形補間）
yToTimeRef.current = (clientY:number): string => { /* ... */ };
```

| 用途 | 使用する関数 |
|---|---|
| タスクカード配置 | `groupLayout[i].top`（完全に詰めた位置） |
| 空き時間カード配置・高さ | `freeLayout[i].freeY`（詰めた位置）/ `finalH`（内容量ベース） |
| 起床・就寝カード配置 | `wakeCardTop` / `sleepCardTop`（同じ詰めたシーケンスの一部） |
| 現在時刻インジケーター | `layoutCalcY(nowMin)` — anchors 補間 |
| ドラッグガイドライン | `layoutYRef`（`layoutCalcY` 経由） |
| タッチY→時刻変換 | `yToTimeRef`（anchors の逆方向補間） |

**現在時刻インジケーター・ドラッグは必ず `layoutCalcY`/`layoutYRef`/`yToTimeRef` を使う。** カード配置が詰めてあるため、実時刻ベースの単純な線形変換（旧 `calcDayY`）を使うと「今」バッジやドラッグ位置がカードの実際の表示位置とズレる。`calcDayY` は削除済み。

### タイムラインのカード高さ計測（ResizeObserver）

タスクカード・空き時間カードの実際の高さを ResizeObserver で計測し、重なりを防ぐ。

```typescript
const [measuredH,setMeasuredH] = useState<Record<string,number>>({});
const roRef = useRef<ResizeObserver|null>(null);
// roRef.current は data-gk 属性をキーにカード高さを記録
```

| `data-gk` キー | 対象 |
|---|---|
| `g.startTime` | 単一タスクグループのカード |
| `task.id` | 同一時刻グループ内の各タスクカード |
| `free-${slot.start}` | 空き時間カード |

### taskGroupList の高さ計算（`g.h`）

```typescript
const h = tasks.length === 1
  ? Math.max(measuredH[startTime] ?? MIN_CARD_H, (tasks[0].duration ?? 0) * PX_PER_MIN)
  : tasks.reduce((sum, t) => sum + Math.max(measuredH[t.id] ?? MIN_CARD_H, 56), 0)
    + (tasks.length - 1) * 16
    + DUP_LABEL_H;  // 重複ラベル分の高さを加算
```

- `DUP_LABEL_H=24` — 同一時刻グループ先頭の「●タスクが重複しています」ラベル用スペース
- `MIN_CARD_H=60`, `WAKE_CARD_H=52`, `SLEEP_CARD_H=52`

### 同一時刻タスク（重複タスク）のアイコン表示（重要）

同一時刻に複数タスクがある場合、アイコンカプセルを縦に連結して表示する。

```
groupLayout の top（グループ先頭Y）
├── top+0              : 「●タスクが重複しています」ラベル（DUP_LABEL_H=24px）
└── top+DUP_LABEL_H    : アイコンスタック + カード列（stackH）
     ├── アイコン列（left: AXIS_X-28）
     │    ├── タスクi のカプセル背景（高さ可変、境界で切り替わる色）
     │    ├── 境界ごとに白い2px区切り線
     │    └── タスクi のアイコン（カード中央に固定配置）
     └── カード列（left: CARD_LEFT）
          ├── TaskCard[0]
          ├── 16px gap
          ├── TaskCard[1]
          └── ...
```

**カプセル高さの計算（伸縮ロジック）:**
```typescript
const CAPSULE_H=56, GAP=16, n=g.tasks.length;
const cardHeights = g.tasks.map(t => Math.max(measuredH[t.id] ?? MIN_CARD_H, CAPSULE_H));
const cardTops: number[] = []; // 各カードのtop（累積）
const centers = g.tasks.map((_, i) => cardTops[i] + cardHeights[i] / 2);
const boundaries = centers.slice(0, -1).map((c, i) => (c + centers[i+1]) / 2);

// カプセルi は境界間を埋めるよう伸縮（外端のみ borderRadius:28、内側は0）
const capTops    = centers.map((c, i) => i===0 ? c-CAPSULE_H/2 : boundaries[i-1]);
const capBottoms = centers.map((c, i) => i===n-1 ? c+CAPSULE_H/2 : boundaries[i]);
```

**ヘルパー関数（Timeline 内で定義）:**
```typescript
// アイコンスタック部分の高さ（DUP_LABEL_H を除く）
const groupStackH = (g) => {
  if (g.tasks.length === 1) return Math.max(measuredH[g.startTime] ?? g.h, 56);
  const heights = g.tasks.map(t => Math.max(measuredH[t.id] ?? MIN_CARD_H, 56));
  return heights.reduce((a, h) => a+h, 0) + (g.tasks.length-1)*16;
};

// グループ先頭からアイコンスタック開始までのオフセット
const groupIconTop = (g) => g.tasks.length > 1 ? DUP_LABEL_H : 0;
```

**時刻ラベルの配置:**  
`top + groupIconTop(g) + groupStackH(g)/2` に vertically-centered で表示（アイコンスタック全体の中央）。

---

## RevenueCat / サブスクリプション実装

### 概要

`src/app/components/Premium.tsx` で RevenueCat SDK を管理する。

```typescript
const RC_API_KEY = 'appl_zyfcgKyGH0RBKcOppeougWslCRP';
const ENTITLEMENT_ID = 'BrainBox Pro';
```

- **ブラウザ・開発環境**: `isNative()` が false → `isPremium = true`（全機能解放）
- **iOS ネイティブ**: RevenueCat SDK を動的 import し、エンタイトルメント `BrainBox Pro` を確認

### isNative()

```typescript
function isNative(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as {Capacitor?: {isNativePlatform?: () => boolean}}).Capacitor?.isNativePlatform?.();
}
```

### 動的 import（重要）

Next.js バンドルに含めないよう `/* webpackIgnore: true */` を付ける。

```typescript
const { Purchases, LOG_LEVEL } = await import(/* webpackIgnore: true */ '@revenuecat/purchases-capacitor');
```

### v13 API の注意点

`getOfferings()` はオブジェクトを直接返す（分割代入しない）：

```typescript
const offerings = await Purchases.getOfferings();       // ✅ v13
// const { offerings } = await Purchases.getOfferings(); // ❌ v9以前の書き方
const pkg = offerings.current?.monthly;
```

### PremiumContext が提供する値

| 値 | 型 | 説明 |
|---|---|---|
| `isPremium` | boolean | PRO 加入済みか |
| `isLoading` | boolean | 初期確認中か |
| `isPurchasing` | boolean | 購入処理中か |
| `purchase` | `()=>Promise<void>` | 月額プランを購入 |
| `restore` | `()=>Promise<boolean>` | 購入を復元 |

### App Store Connect 設定

| 項目 | 値 |
|---|---|
| 製品ID | `jp.brainbox.app.premium.monthly` |
| サブスクリプショングループ | PROプラン |
| Apple ID | 6787816884 |
| 価格 | ¥200/月 |
| ローカリゼーション（日本語） | 表示名: BrainBox PRO / 説明: PRO機能が使い放題に |

### PRO画面（SettingsScreen 内 `sub==='pro'`）

```tsx
// isPremium=false: 購入UI
<div>¥200/月カード + "PROプランを始める"ボタン + "購入を復元"リンク</div>
// isPremium=true: 利用中UI
<div>"PROプランを利用中です"カード</div>
```

- `SettingsRow` の PRO 行: `isPremium ? '利用中' : '月額¥200'`
- `purchase()` / `restore()` は `usePremium()` から取得

### 避けるパターン

- `Premium.tsx` の `isPremium` をブラウザ環境以外でハードコード `true` に戻さない
- `@revenuecat/purchases-capacitor` を `/* webpackIgnore: true */` なしで static import しない（ビルドエラー）
- v13 の `getOfferings()` を `{ offerings }` で分割代入しない

---

## 主要な型定義

| 型 | 説明 |
|---|---|
| `Task` | id, name, startTime, duration, memo, icon, completed, date, isLater, recurrence, customRec, pinned, tags, notifications, incompleteReminder, category, postponedCount, color, subtasks, photoCount |
| `Settings` | wakeTime, sleepTime, **keepIncomplete?:boolean** |
| `FreeSlot` | タイムライン上の空き時間スロット |
| `ShopItem` | 買い物リストのアイテム（7日後に自動削除） |
| `TagDef` | タグ定義（name, color） |
| `CustomRec` | カスタム繰り返し設定 |
| `MoveHistory` | 未完了タスクの「あとでやる」移動履歴 |
| `CustomTab` | ユーザー定義ファイルタブ（`{id:string; name:string}`） |
| `TaskMode` | `'later'` / `'scheduled'` / `'recurring'` |
| `TaskGroupData` | `{startTime, tasks, rows, h}` — タイムラインの時刻グループ |

`Task.subtasks` は `{id:string; name:string; completed:boolean}[]` 型。  
`Task.tags` は `string[]`（タグ名を直接格納）。  
`Task.photoCount` は添付写真枚数（写真データ本体は `PHOTOS_KEY` に別途保存）。  
`Settings.keepIncomplete` — true: 未完了タスクをタイムラインに残す / false（デフォルト）: 就寝後に「あとでやる」へ移動。

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
| メインアクセント | `#D9A3B2` | **選択中**ファイルタブ・FAB・バッジ・週カレンダー選択日・TaskModalヘッダー・重複ラベルの●印 |
| ソフトレッド | `#D97A7A` | 削除・エラー |
| プライマリ黒 | `#1F1F1F` | 重要ラベル |
| テキスト主 | `text-gray-800` | 通常テキスト |
| テキスト副 | `text-gray-400` | サブテキスト・ラベル・曜日 |

**注意**: 旧テーマカラー `#7FAE8C`（セージグリーン）はすでに削除済み。`#D9A3B2`（ダスティピンク）が現在の統一アクセントカラー。

### 背景色レイアウト

| 領域 | 背景色 | 備考 |
|---|---|---|
| アプリ全体コンテナ | `bg-white` | |
| ヘッダー（日付・週カレンダー・タブ） | `bg-gray-50` | sticky top-0 |
| タイムライン（main） | bg継承（白） | コンテナが白 |
| BottomBar（あとでやる・買い物） | `bg-gray-50` | fixed bottom |

### iOS セーフエリア対応（重要）

Capacitor（WKWebView）でネイティブ表示するため、すべてのフルスクリーン画面のヘッダーに safe area inset を適用している。

| 画面 | 適用箇所 | paddingTop |
|---|---|---|
| メインヘッダー | `<header>` | `env(safe-area-inset-top)` |
| CalendarPage | ヘッダー div | `calc(1rem + env(safe-area-inset-top))` |
| SearchPage | ヘッダー div | `calc(1rem + env(safe-area-inset-top))` |
| SettingsScreen（`subHeader`） | `subHeader()` div | `calc(0.875rem + env(safe-area-inset-top))` |
| 通知・買い物設定画面 | ヘッダー div | `calc(0.875rem + env(safe-area-inset-top))` |
| BottomBar 下端 | `<div style={{height:'env(safe-area-inset-bottom)'}}/>` | — |
| FAB・main のpaddingBottom | inline style | `calc(3.5rem + env(safe-area-inset-bottom))` |

**新しいフルスクリーン画面を追加するときは必ず safe-area-inset-top を適用すること。**

`globals.css` に `html { background-color: #F9FAFB; }` を設定済み（iOS の黒帯を防ぐ）。  
`capacitor.config.js` に `backgroundColor: '#F9FAFB'` / `ios: { contentInset: 'never' }` を設定済み。

### ヘッダー構造（上から順）

① 日付表示（`2026年6月14日`）＋ カレンダー・検索・設定アイコン  
② 1週間カレンダー（日〜土）  
③ ファイルタブ（すべて・ユーザー定義タブ・＋）  
④ タイムライン（白背景）

```jsx
<header className="sticky top-0 z-30 bg-gray-50">
  <div className="px-4 pt-1 pb-0">
    {/* ① 日付 + アイコン */}
    {/* ② 週カレンダー */}
  </div>
  {/* ③ ファイルタブ */}
</header>
<main className="px-3 pt-3 pb-24">
  {/* ④ タイムライン（白背景を継承） */}
</main>
```

**週カレンダー（日〜土）:**
- 曜日13px・日付20px、コンパクト表示
- **曜日テキストはすべて `text-gray-400`** — 日曜・土曜も色分けしない
- 選択日: `bg-[#D9A3B2] text-white`、今日（未選択）: `bg-gray-100 text-gray-900`
- 左右スワイプ（dx>50px かつ縦より横が大きい）→ ±7日移動

### ファイルタブ（カスタムタブ）

メインヘッダーと CalendarPage の両方で**ファイルタブ型**を採用。

- `すべて`（常に先頭）+ ユーザー定義タブ（`CustomTab[]`） + `+` ボタン
- タブをタップ → 未選択なら選択、選択中ならインライン名前編集に入る
- タブを削除したタスクは自動的に `すべて`（`category: null`）扱いになる

**ファイルタブ型スタイル（現在の実装）：**
```jsx
<div className="bg-gray-50">
  <div className="flex items-end px-3 pt-2" style={{overflowX:'auto',WebkitOverflowScrolling:'touch'}}>
    <button style={active ? {
      padding:'7px 18px 9px', background:'#D9A3B2', color:'white', fontWeight:700, fontSize:'0.875rem',
      border:'none', borderRadius:'14px 14px 0 0', marginBottom:'-2px', zIndex:10,
      boxShadow:'0 4px 12px rgba(0,0,0,0.10)',
    } : {
      padding:'5px 18px', background:'#FFFFFF', color:'#6B7280', fontWeight:600, fontSize:'0.875rem',
      border:'none', borderRadius:'14px 14px 0 0', marginBottom:'2px',
      boxShadow:'0 4px 10px rgba(0,0,0,0.08)',
    }}>{label}</button>
  </div>
</div>
```

- 外枠は **`bg-gray-50`**（ヘッダーと同じ）
- **選択中タブ**: `background:'#D9A3B2'`・白テキスト・`marginBottom:'-2px'`
- **非選択タブ**: `background:'#FFFFFF'`（白）・`color:'#6B7280'`
- すべて inline style で実装（Tailwind では `-mb-px` 等の表現が難しいため）

### 現在時刻インジケーター

```jsx
{date===todayStr()&&nowMin>=wakeMin&&nowMin<=sleepMin&&(
  <div className="absolute flex items-center z-20 gap-1.5"
    style={{top:`${layoutCalcY(nowMin)-12}px`,left:'-4px',right:0}}>
    <div className="bg-[#D9A3B2] text-white text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap">{now}</div>
  </div>
)}
```

- バッジのみ表示（横線・＋ボタンは削除済み）
- Y座標は **`layoutCalcY(nowMin)`**（anchors補間）を使用 — カード配置が詰めてあるため

### TaskCard

タイムライン上のタスクカード。下部にアイコン行を持つ。

**アイコン行（サブタスクあり OR メモあり OR 写真あり）**

```jsx
<div className="flex items-center gap-2 mt-2">
  {/* サブタスク進捗カプセル */}
  <button className="inline-flex items-center gap-2 bg-gray-100 rounded-2xl px-3 active:bg-gray-200" style={{height:'32px'}}>
    <AppIcons.checkSquare size={13}/>
    <span>{doneCount}/{subtasks.length}</span>
  </button>
  {/* メモアイコン */}
  <button className="inline-flex items-center justify-center bg-gray-100 rounded-xl active:bg-gray-200" style={{width:'32px',height:'32px'}}>
    <AppIcons.task size={14}/>
  </button>
  {/* カメラアイコン（写真ありの場合） */}
  <button className="inline-flex items-center justify-center bg-gray-100 rounded-xl active:bg-gray-200" style={{width:'32px',height:'32px'}}>
    <AppIcons.camera size={14}/>
  </button>
</div>
```

- カメラボタンはメモ・サブタスクボタンと同じスタイル（`bg-gray-100 rounded-xl`、32×32px）
- `openPanel: 'subtask' | 'memo' | null` — 排他的プルダウン

### FreeTimeCard（空き時間カード）

- 高さは時間軸に依存しない。`calcFreeContentH(laterPool)` で「あとでやる」リストを全件表示できる最小高さを計算
- `calcFreeContentH` は全角文字（CJK等）を14px、半角を7px として折り返し行数を計算する
- `ResizeObserver` で実測した高さを `measuredH['free-${slot.start}']` に保存し、次フレームのレイアウトに反映
- スタイル: `<div style={{minHeight:'${height}px'}}>` — クリップなし、内容に応じて伸長可

### TaskModal（タスク詳細画面）

ボトムシート型モーダル。上部カラーヘッダー + 下部ホワイトコンテンツの2層構成。

**カラーヘッダー（ヘッダー背景色はアイコンカラーに連動）**

```typescript
// ヘッダー背景色の計算（アイコンカラーを18%暗くする）
const headerBg = (() => {
  const hex = color || '#D9A3B2';
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgb(${Math.round(r*0.82)},${Math.round(g*0.82)},${Math.round(b*0.82)})`;
})();
```

- すべてのヘッダー内要素は `white/20` か `white/90` ベースで統一（暗い背景に馴染む）

**ヘッダー内レイアウト順序（上から）:**
1. ボタン行（× ＋ 完了/保存）
2. アイコン ＋ タスク名入力
3. モードタブ（あとで／時間指定／繰り返し）← 先
4. ファイルタブ（すべて／タブ1／...）← 後（タイムラインと同じ folder tab スタイル）

**ホワイトコンテンツ（bg-gray-50、`max-h-[55vh] overflow-y-auto`）**
1. 繰り返し設定カード（繰り返しモード時のみ）
2. 設定カード（日付・時間・アラート・タグ・サブタスク）
3. メモカード
4. 写真カード（`ref={photoSectionRef}`）
5. 削除ボタン（編集時のみ）

**自動保存のdeps（重要）:**
```typescript
},[name,taskDate,startTime,duration,mode,recur,customRec,tags,subtasks,memo,category,notifications,incompleteRem,photos,icon,color]);
// icon と color が含まれていること！抜けるとアイコン変更が保存されない
```

### ドラッグ＆ドロップ（タスク移動）

- 長押し 500ms → vibrate → drag 開始
- ドロップ時刻のクランプは**起床・就寝時間に縛られない**（0:00〜23:55 の全時間帯に配置可）
- **過去日付へのドラッグも可能**（日付制限なし）
- ドラッグガイドライン: `bg-gray-300`（線）/ `bg-gray-600 text-white`（時刻バッジ）
- `yToTimeRef` でタッチY座標→時刻変換（ピースワイズアンカー補間）

**繰り返しタスクのドラッグ（重要）:**
```typescript
if(dragTask.recurrence){
  setPendingDragMove({task:dragTask, time});
} else {
  setTasks(prev=>prev.map(...));
}
```
- `pendingDragMove: {task:Task; time:string} | null` — ドロップ後の確認待ち状態
- ポップアップで「この予定のみ変更」「すべての予定を変更」「キャンセル」を選択

### 起床・就寝カード（Timeline 内）

**ドラッグ＆ドロップは廃止済み。** カード・アイコンともにタップで時間変更する。

- タップ → `onEditTime?.('wake'|'sleep')` → App 側で時間ピッカーボトムシートを表示
- `<input type="time">` で時刻入力 → 「完了」ボタンで `settingConfirm` にセット
- 確認ポップアップ（`settingConfirm` state）:
  - **「この日だけ変更」** → `dayOverrides[date]` に保存（`DAY_SETTINGS_KEY`）
  - **「すべての日に適用」** → グローバル `settings` を更新（`SETTINGS_KEY`）
  - **「キャンセル」** → 変更なし

**アイコン色の変更:**
- `onPickColor?.('wake'|'sleep')` → `colorPickTarget` state をセット
- カラーピッカーボトムシートで選択 → `settings.wakeColor` / `settings.sleepColor` を更新

**Timeline の関連 props:**
```typescript
onPickColor?:(target:'wake'|'sleep')=>void;
onEditTime?:(target:'wake'|'sleep')=>void;
```

**App の関連 state:**
```typescript
const [colorPickTarget,setColorPickTarget] = useState<'wake'|'sleep'|null>(null);
const [timePickerTarget,setTimePickerTarget] = useState<'wake'|'sleep'|null>(null);
const [timePickerValue,setTimePickerValue] = useState('');
const [settingConfirm,setSettingConfirm] = useState<{type:'wake'|'sleep';newTime:string}|null>(null);
```

> `dragSetting` state・`startDragSetting` 関数・`pressingWake`/`pressingSleep` は削除済み。

### BottomTabs（あとでやる・買い物リスト）

iOS ボトムシートスタイル。フルスクリーンオーバーレイ＋シート本体の2層構成。

**閉じる操作:** オーバーレイタップ / ハンドルバータップ / 下スワイプ（dy>60px）

**CSS Grid stacking の意図:**  
両タブを常にDOMに保持し、`visibility:hidden` で非表示にする（`display:none` にすると高さゼロになりレイアウト崩れ）。

**並び替えボタン（3ステート）:** `null`→`'asc'`→`'desc'`、バッジ: `bg-[#D9A3B2] text-white rounded-full`

### Bottom Bar・FAB

```jsx
{/* Bottom Bar */}
<div className="fixed bottom-0 left-0 right-0 z-40 max-w-md mx-auto bg-gray-50 rounded-t-2xl"
  style={{boxShadow:'0 -4px 16px rgba(0,0,0,0.10)'}}>
  <div className="flex">
    {([['later','あとでやる',pendingCount],['shop','買い物リスト',shopPending]]).map(([tab,label,cnt],i)=>(
      <button key={tab} className={`flex-1 flex items-center justify-center gap-2 py-3 ...`}>
        <span className="text-base font-semibold ...">...</span>
      </button>
    ))}
  </div>
  <div style={{height:'env(safe-area-inset-bottom)'}}/>
</div>

{/* FAB */}
<div className="fixed right-4 z-50" style={{bottom:'calc(3.5rem + env(safe-area-inset-bottom))'}}>
  <button className="w-14 h-14 bg-[#D9A3B2] text-white rounded-full shadow-2xl active:bg-gray-700">
    <AppIcons.plus size={28}/>
  </button>
</div>
```

**Bottom Bar タブのスタイル（重要）:** `py-3 text-base font-semibold` — `py-2 text-sm` にしない。

### SettingsScreen（設定画面）

設定メニューの並び順：タグ → **ファイルタブ** → 繰り返しタスク → 通知 → 表示設定 → **未完了タスクの扱い** → 起床・就寝

**SettingsScreen の props（重要）:**
```typescript
function SettingsScreen({..., tasks, onEditTask}: {
  tasks: Task[];
  onEditTask: (t: Task) => void;
  ...
})
```

**繰り返しタスク一覧（`sub==='recurring'`）:**  
「準備中」プレースホルダーは削除済み。`tasks` から `recurrence` が null でないものを重複排除して表示する。

```typescript
const recTasks = tasks.filter((t,i,a)=>t.recurrence&&a.findIndex(x=>x.name===t.name&&x.recurrence===t.recurrence)===i);
// → recLabel(t) でラベル表示、getTaskIcon(t.icon) でアイコン表示
// → タップで onEditTask(t) を呼び出してタスク編集モーダルを開く
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
- **手帳らしいシンプルな雰囲気を維持する** — アクセントカラーは選択状態など必要最小限に使う

### フォント・カラー

- ベースフォントサイズ: `17px`（globals.css に設定済み）
- テキスト: `text-gray-800`（primary）、`text-gray-400`（secondary）
- カード背景: `bg-white`、アプリ背景: `bg-white`（タイムライン部分）
- ヘッダー/フッター背景: `bg-gray-50`
- **メインアクセント**: `#D9A3B2`（ダスティピンク）— **選択中**タブ・FAB・選択状態・バッジ・TaskModalヘッダー
- **削除・エラー**: `#D97A7A`（ソフトレッド）
- **プライマリ黒**: `#1F1F1F`（重要ラベル）

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
- 旧テーマカラー `#7FAE8C`（セージグリーン）を新たに使う（現在は `#D9A3B2` が正）
- 週カレンダーの曜日を日曜赤・土曜青に色分けする（全曜日 `text-gray-400` で統一）
- TaskModal内で `bg-gray-700`・`bg-gray-800` を新たに使う（現在は `bg-white/20` ベース）
- 現在時刻インジケーターやドラッグ判定に実時刻ベースの単純な線形変換を使う（カード配置が詰めてあるため、必ず `layoutCalcY`/`layoutYRef`/`yToTimeRef`（anchors補間）を使う）
- 同一時刻タスクのアイコンに固定56pxの円形カプセルを使う（現在は伸縮・連結スタイル）
- `CompactTaskCard` を新たに呼び出す（dead code。同一時刻タスクは TaskCard + 連結アイコンで表示）
- 起床・就寝カードにドラッグ処理を復活させる（廃止済み。タップ → 時間ピッカーに変更済み）
- `dragSetting` state や `startDragSetting` 関数を新たに追加する（削除済み）
- フルスクリーン画面のヘッダーに `env(safe-area-inset-top)` を付け忘れる

---

## 開発ルール

### 修正前の確認（最重要）

**必ず現在の実装を Read/Grep で確認してから変更する。** 既存コードを見ずに書き直さない。  
関連する定数・型・コンポーネントを grep で把握してから手を入れる。  
「こうなっているはず」という推測で変更しない。

### 変更の原則

1. **必要最小限の変更のみ**行う — 関係ない箇所は触らない
2. **既存コンポーネントを流用**することを優先する — 新しく作る前に既存を確認
3. **大規模リファクタリングを避ける**（約3400行の1ファイル構成は意図的）
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
- **繰り返しタスクのドラッグ**: drop後に `pendingDragMove` state を介して確認ポップアップを表示
- 繰り返しタスクは `generateCustomDates()` で将来日程を生成し、`tasks` に展開して保存
- 「あとでやる」タスクは `isLater: true`、日付をまたいで持ち越し可能
- **過去日付へのタスク追加・ドラッグが可能**（日付制限なし）
- スマートフォン最適化済み（`userScalable: false`、`overscroll-none`）
- 写真データ（base64）は `PHOTOS_KEY` に `{[taskId]: string[]}` 形式で保存。タスク削除時は必ずクリーンアップ
- BottomTabs のタブパネルは `visibility:hidden` + `pointer-events:none` で非表示にする（`display:none` にするとレイアウト崩れ）
- TaskModal の auto-save useEffect deps に `icon` と `color` を含めること（抜けるとアイコン変更が保存されない）
- 空き時間カードの高さは `minHeight` で指定（`height` では内容がクリップされる）
- `AXIS_X=72`・`CARD_LEFT=108` — ハードコードせず定数から導出すること

---

## Vercel / Git 運用

- `main` または `claude/**` branch への push で **GitHub Actions** が Vercel deploy hook を呼び出して自動デプロイ
  - `.github/workflows/deploy.yml` — `on: push: branches: [main, 'claude/**']`
  - deploy hook のレスポンスをログ出力し、非200系のステータスでは `exit 1`
  - deploy hook URL は GitHub リポジトリの `VERCEL_DEPLOY_HOOK` シークレットに設定済み
- 作業完了後は必ず `npm run build` → `git push origin HEAD:main`
- **push すればセッションブランチ・main どちらでも自動デプロイされる**

### ブランチ運用の注意

**セッション開始時の必須手順:**

```bash
git fetch origin && git reset --hard origin/main
```

これで常に最新の main から作業開始できる。

**main への push（標準）:**

```bash
git fetch origin main && git rebase origin/main && git push origin HEAD:main
```

セッションブランチが origin/main より遅れている場合は rebase してから push する。

**セッションブランチへの push（著者情報修正が必要な場合）:**

stop hook が「Unverified」を検出した場合、以下で修正する:

```bash
git config user.email noreply@anthropic.com && git config user.name Claude
# 複数commitをまとめて修正する場合:
git rebase --exec "git commit --amend --no-edit --reset-author --allow-empty" origin/claude/<セッション名>
git push origin claude/<セッション名> --force-with-lease
```

**ソースオブトゥルース: `main` ブランチが常に最新。** すべての作業完了後は必ず `origin/main` に push する。

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

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
npm run build   # 本番ビルド（Vercel/Web用。ビルド確認・コミット前の型チェックにはこれで十分）
npm run lint    # ESLint
```

テストフレームワークなし。

### iOS実機ビルドは `npm run build` だけでは反映されない（重要）

`next.config.js` は `BUILD_TARGET=ios` 環境変数がある時だけ `output:'export'`（静的書き出し、`out/`フォルダ生成）になる。**普通の `npm run build` はこの変数が無いため `out/` を更新しない**（Vercel向けの通常ビルドが動くだけ）。Capacitorの `npx cap sync ios` はこの `out/` の中身を `ios/App/App/public` にコピーするため、`npm run build` だけ実行して `npx cap sync ios` しても**実機には古いWebコンテンツのまま反映されない**（ビルド自体は成功したように見えるため気づきにくい）。

iOS実機で動作確認する時は、必ず専用スクリプトを使うこと：

```bash
./build-ios.sh   # BUILD_TARGET=ios npm run build（APIルート退避込み）→ cap sync ios まで一括で行う
```

`npm run build && npx cap sync ios` を手動で実行するのは避ける（`BUILD_TARGET=ios`を付け忘れて`out/`が更新されないまま気づかず長時間デバッグする実際の事故が発生した実績あり）。

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

**`webpackIgnore: true` は付けない。** 付けるとバンドルされず、実機で
`import()` がパッケージ名を素のURLとして解決しようとして
`Module name, '@revenuecat/purchases-capacitor' does not resolve to a valid URL`
エラーになり、購入・復元・起動時のisPremiumチェックが全て失敗する
（過去にこの状態でリリースし、購入ボタンが無反応/エラーになるバグを
起こした実績あり）。static importでのビルドエラーを避けたいだけなら、
webpackIgnoreなしのdynamic importで十分（webpackが別チャンクとして
正しくバンドルし、ビルドも通る）。

```typescript
const { Purchases, LOG_LEVEL } = await import('@revenuecat/purchases-capacitor');
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
- `@revenuecat/purchases-capacitor` を **static import** しない（ビルドエラー）。ただし **dynamic import に `webpackIgnore: true` は付けない**（実機で購入が失敗する実際のバグの原因になった）
- v13 の `getOfferings()` を `{ offerings }` で分割代入しない

---

## アプリ内通知の送信（LocalNotifyPlugin）

**重要な過去の不具合:** このアプリの通知（起床チェックイン・買い物リスト・放置タスク・タスクごとのアラート・空き時間提案）は元々すべて `new Notification(...)`（Web Notifications API）で実装されていたが、**WKWebViewはこのAPIを実装しておらず、実機では常に何も起きずサイレントに失敗していた**（`typeof Notification!=='undefined'` のガードで例外は出ないため誰も気づかなかった）。実機のiOS設定アプリ → BrainBoxのページに「通知」の許可項目自体が表示されない（＝一度もネイティブの通知許可がリクエストされたことがない）ことから発覚した。

この修正以降、**アプリ内の通知は必ず `src/app/components/LocalNotify.ts` の `notify(title, body)` を呼ぶこと。`new Notification(...)` を直接呼ばない。**

```typescript
import { notify } from './components/LocalNotify';
notify('おはようございます', body);
```

- ネイティブ: `LocalNotifyPlugin.notify()` を呼び、`UNUserNotificationCenter.current().requestAuthorization(...)` してから即座に `UNNotificationRequest`（trigger: nil = 即時発火）を `add()` する
- Web/開発環境: 従来通り `window.Notification` にフォールバック（ブラウザでの動作確認はこれで可能）
- 各通知の発火判定自体（`now` ベースのポーリング、`useEffect` 群）は**アプリがフォアグラウンドで開かれている間しか動かない**。バックグラウンド/未起動でも発火させたい機能（場所通知・アプリ起動リマインダー・タスクごとのアラート）は、`GeofencePlugin`/`InactivityPlugin`/`LocalNotifyPlugin.syncTaskAlerts` のように専用のネイティブスケジューリング（`CLCircularRegion`監視・`UNTimeIntervalNotificationTrigger`・`UNCalendarNotificationTrigger`）が必要

### タスクごとのアラートのネイティブ事前予約（`syncTaskAlerts`）

**過去の不具合:** タスクごとのアラート（`Task.notifications`、開始時・何分前・前日）は当初 `now` ポーリングの `useEffect` で即時 `notify()` していたが、これは**アプリがフォアグラウンドの間しか判定が走らない**ため、バックグラウンド/未起動では一切通知が来なかった（`notify()` 自体はWKWebViewでも動くのに、呼び出し元の判定がJS実行に依存していたのが原因）。`GeofencePlugin`/`InactivityPlugin` と同じ設計思想で、`LocalNotifyPlugin.syncTaskAlerts()` により `UNCalendarNotificationTrigger`（日時指定）でネイティブに事前予約する方式に変更した。

- `src/app/components/LocalNotify.ts` の `syncTaskAlerts(alerts)` — ネイティブでのみ動作（Web/開発環境は何もしない）
- `src/app/page.tsx` の App コンポーネントに、`tasks` が変わるたびに未来の全アラート（未完了・`isLater` でない・`startTime`/`date`/`notifications` ありのタスク）を発火時刻順にソートし、**直近60件**（iOSのローカル通知同時予約上限64件に対する安全マージン）だけ `syncTaskAlerts()` に渡す `useEffect` がある
- `LocalNotifyPlugin.swift` の `syncTaskAlerts()` は `GeofencePlugin.setGeofences` と同じく、呼ばれるたびに既存の `task-alert-` prefix の予約を全解除してから渡された内容で登録し直す（差分更新はしない）。識別子は `task-alert-${taskId}-${分オフセット}`
- 60件を超える分は今は予約されないが、`tasks` 変更のたびに再計算されるため、手前のアラートが消化されて `tasks` が変わればその都度自動的に繰り上がる
- 旧来の `now` ポーリング＋即時 `notify()` の `useEffect`（`TASK_ALERT_FIRED_KEY` 使用）は削除せず残しているが、**ネイティブでは `isNative()` で早期returnし動作しない**。Web/開発環境でのみのフォールバックとして機能する（ネイティブで両方動くと同一時刻に二重発火するため）

### 空き時間通知のネイティブ事前予約（`syncFreeSlotAlerts`）

「空き時間が5分続いたら『あとでやる』タスクの消化を提案する」通知も、`syncTaskAlerts`と全く同じ設計で `syncFreeSlotAlerts()` によりネイティブに事前予約している。

- `src/app/components/LocalNotify.ts` の `syncFreeSlotAlerts(alerts)` — ネイティブでのみ動作
- `src/app/page.tsx` の App コンポーネントに、`tasks`/`settings` が変わるたびに当日の `calcFreeSlots()` 結果から「各空き時間の開始5分後」の時刻で予約する `useEffect` がある（あとでやるタスクが0件の場合は空配列で予約解除）
- `LocalNotifyPlugin.swift` は `syncTaskAlerts`/`syncFreeSlotAlerts` 共通の `scheduleAlerts(prefix:call:)` を内部で使い、`free-slot-` prefixで全解除→再登録する。識別子は `free-slot-${date}-${slot.start}`
- 通知本文はスケジュール計算時点の「あとでやる」件数から組み立てるため、実際に発火するまでの間にタスクが完了して中身が古くなる可能性はあるが、`tasks`変更のたびに再計算されるため大きくずれることはない
- 旧来の `now` ポーリング＋即時 `notify()` の `useEffect`（`tl-freeslot-notif-`キー使用）はWeb/開発環境専用フォールバックとして残っており、ネイティブでは `isNative()` で早期returnする

### 買い物リスト時間指定通知のネイティブ事前予約（`syncShopNotifs`）

`ShopNotifSetting`（曜日＋時刻の時間指定通知）も同じ設計で `syncShopNotifs()` によりネイティブに事前予約している。

- `src/app/components/LocalNotify.ts` の `syncShopNotifs(alerts)` — ネイティブでのみ動作
- `src/app/page.tsx` の App コンポーネントに、`shopNotifSettings`/`shopItems` が変わるたびに**直近7日分**の該当曜日をまとめて計算して予約する `useEffect` がある（未購入アイテムが0件の場合は空配列で予約解除）。識別子は `shop-notif-${settingId}-${日数オフセット}`
- `LocalNotifyPlugin.swift` は共通の `scheduleAlerts(prefix:call:)` を使い、`shop-notif-` prefixで全解除→再登録する
- 通知本文はスケジュール計算時点の未購入件数から組み立てるため、`shopItems`/`shopNotifSettings`変更のたびに再計算され、直近7日分を毎回スケジュールし直すことで曜日が一巡してもズレない
- 旧来の `now` ポーリング＋即時 `notify()` の `useEffect`（`tl-shop-notif-fired-`キー使用）はWeb/開発環境専用フォールバックとして残っており、ネイティブでは `isNative()` で早期returnする

### 「あとでやる」放置タスク通知のネイティブ事前予約（`syncLaterStaleAlerts`）

放置タスク通知（`laterReminderHours`）も同じ設計で `syncLaterStaleAlerts()` によりネイティブに事前予約している。

- `src/app/components/LocalNotify.ts` の `syncLaterStaleAlerts(alerts)` — ネイティブでのみ動作
- `src/app/page.tsx` の App コンポーネントに、`tasks`/`laterReminderHours` が変わるたびに、`isLater`かつ未完了の各タスクについて `laterSince + 設定時間` の絶対時刻で予約する `useEffect` がある。識別子は `later-stale-${taskId}-${repeatIndex}`
- 発火予定時刻が就寝時間帯に重なる場合は `adjustFireForSleep()` で起床時刻まで後ろ倒しする
- タスク単位で個別に通知する設計に変更した（旧JS版は複数の放置タスクを1通知にまとめていたが、ネイティブ事前予約では内容を後から動的に合成できないため）
- **未解決なら再通知する（`STALE_REPEAT_HOURS`/`STALE_MAX_REPEATS`）:** タスクが完了しないままだと、最初の通知に加えて `STALE_REPEAT_HOURS`（6時間）おきに最大 `STALE_MAX_REPEATS`（5回）まで追加の通知を事前予約する（`later-stale-${taskId}-0`が最初の通知、`-1`以降が再通知）。タスクが完了すれば次回の`tasks`変更時にまとめて全解除されるため、それ以上再通知されない。バックグラウンド/未起動のままアプリが開かれなくても、事前予約した分は届く（未来永劫ではなく `STALE_MAX_REPEATS` 回で打ち止め）
- 旧来の `now` ポーリング＋即時 `notify()` の `useEffect`（`LATER_NOTIFIED_KEY`使用）はWeb/開発環境専用フォールバックとして残っており、ネイティブでは `isNative()` で早期returnする

### 起床時チェックイン通知のネイティブ事前予約（`syncWakeCheckins`）

起床時刻に「今日の予定をチェックしましょう」を出す通知も同じ設計で `syncWakeCheckins()` によりネイティブに事前予約している。

- `src/app/components/LocalNotify.ts` の `syncWakeCheckins(alerts)` — ネイティブでのみ動作
- `src/app/page.tsx` の App コンポーネントに、**直近7日分**の起床時刻をまとめて予約する `useEffect` がある。識別子は `wake-checkin-${日数オフセット}`
- 当日分（オフセット0）のみ「昨日の未完了タスク件数」を本文に反映する。翌日以降は未来の状態が分からないため一般的な文言（「今日の予定をチェックしましょう」）にする
- 旧来の `now` ポーリング＋即時 `notify()` の `useEffect`（`WAKE_CHECKIN_NOTIF_KEY`使用）はWeb/開発環境専用フォールバックとして残っており、ネイティブでは `isNative()` で早期returnする

### 締切管理のネイティブ事前予約（`syncDeadlineAlerts`、PRO機能）

「単なるリマインダーではなく期限を忘れないための仕組み」として、タスクに任意で締切日時（`Task.deadlineAt`、ISO文字列 `"YYYY-MM-DDTHH:mm"`）と通知タイミング（`Task.deadlineNotify`: `'week'|'3days'|'dayBefore'|'sameDay'|'auto'`）を設定できる。**PRO専用機能**（TaskModalの締切行タップ時に非PROなら`ProGateSheet`を表示しブロックする）。他の通知機能と同じ設計で `syncDeadlineAlerts()` によりネイティブに事前予約している。

- `page.tsx` の `computeDeadlineFires(deadlineAt, opt)` が通知タイミング設定から実際の発火時刻一覧（`DeadlineFire[]`）を計算する。`week`/`3days`/`dayBefore`は締切のN日前、`sameDay`は締切当日の朝9時（`DEADLINE_SAMEDAY_HOUR`）、`auto`（おまかせ）は1週間前・3日前・前日・当日・5時間前・3時間前・1時間前・締切ちょうど、の8件をまとめて予約する
- `deadlineAlertBody(taskName, fire)` が通知本文を組み立てる（例:「運転免許の更新期限まで、あと3日です。」「住民税の支払い期限は今日です。」）
- `deadlineRemainLabel(deadlineAt)` がタイムライン・あとでやるリストでの表示用ラベル（「締切まであと14日」「締切は今日」「締切から3日超過」）を計算する。時刻は無視しカレンダー日数だけで計算する
- `src/app/components/LocalNotify.ts` の `syncDeadlineAlerts(alerts)` — ネイティブでのみ動作
- `src/app/page.tsx` の App コンポーネントに、`tasks` が変わるたびに未完了かつ`deadlineAt`/`deadlineNotify`があるタスクの未来のfireをすべて計算し、直近60件を`syncDeadlineAlerts()`に渡す `useEffect` がある。識別子は `deadline-${taskId}-${fireKey}`（`fireKey`は`week`/`3days`/`dayBefore`/`sameDay`/`5h`/`3h`/`1h`/`exact`）
- `LocalNotifyPlugin.swift` は他の通知と共通の `scheduleAlerts(prefix:call:)` を使い、`deadline-` prefixで全解除→再登録する
- Web/開発環境専用フォールバック（`now`ポーリング＋即時`notify()`、`DEADLINE_ALERT_FIRED_KEY`使用）も用意しており、ネイティブでは`isNative()`で早期returnする
- 表示: `TaskCard`とBottomTabsの「あとでやる」リスト行に、締切がある場合は🚩アイコン付きで`deadlineRemainLabel()`のラベルを表示する（超過・当日は`#D97A7A`、それ以外はグレー）
- PRO比較表（設定 → PRO）に「締切管理」の行を追加済み

### Xcodeでの手動セットアップ（`ios/`はgitignore対象なので毎回必要）

1. `native-ios/LocalNotifyPlugin.swift` / `.m` を `ios/App/App/` に追加（Target Membership: App）
2. `native-ios/BridgeViewController.swift` の `capacitorDidLoad()` に `bridge?.registerPluginInstance(LocalNotifyPlugin())` があることを確認（無ければ追記。既存の `ios/App/App/BridgeViewController.swift` は `git pull` で自動反映されないので **Xcode上で直接編集**）
3. App Group・Info.plist・Background Modesの追加設定は不要（通知権限のリクエストはコード内で完結し、Info.plistの usage description キーも通知には不要）
4. **`LocalNotifyPlugin.swift`/`.m` を編集した場合、`ios/App/App/` 内の既存ファイルは `git pull` しても自動更新されない**（`ios/` はgitignore対象で、Xcodeに追加した時点でプロジェクト内に物理コピーが作られているため）。`native-ios/` の最新内容を都度 Xcode上のファイルにコピーし直す（既存ファイルを削除して `native-ios/` から追加し直すのが確実）

### 避けるパターン

- `new Notification(...)` を直接呼ばない（WKWebViewでは動かない。必ず `notify()` 経由にする）
- 新しい通知処理を追加するときに、既存の `useEffect` 群（フォアグラウンドの `now` ポーリング）だけで済むと思い込まない。バックグラウンド/未起動でも発火が必要なら、必ずネイティブスケジューリング方式（Geofence/Inactivity/タスクアラートと同じ設計）を検討する
- タスクアラートの発火判定を `now` ポーリング＋即時 `notify()` だけで実装しない（ネイティブでは `syncTaskAlerts` の事前予約が必須。`now` ポーリング版はWeb/開発環境専用のフォールバックとして `isNative()` で分岐させる）

---

## ホーム画面アイコン切り替え（AppIconPlugin）

PRO機能の1つ。設定 → PRO → アプリアイコン で選んだ色をホーム画面アイコンに反映する。

- `src/app/components/AppIcon.ts` — `setNativeAppIcon(name)` がCapacitorカスタムプラグイン `AppIconPlugin` を呼び出す（Web/開発環境では何もしない）
- `native-ios/AppIconPlugin.swift` / `native-ios/AppIconPlugin.m` — 実際のアイコン切り替え処理（`UIApplication.shared.setAlternateIconName`）。Xcodeで `ios/App/App/` に追加し、Target Membership: App にする
- `native-ios/BridgeViewController.swift` — **これが無いとプラグインが動かない（重要）**。Capacitor 8はnpm経由ではないローカルカスタムプラグインを自動検出しないため、`capacitorDidLoad()` で `bridge?.registerPluginInstance(AppIconPlugin())` を明示的に呼ぶ必要がある

**`ios/` はgitignore対象なので、新しいXcodeプロジェクトやクリーンチェックアウトでは以下を毎回手動で行うこと：**

1. `native-ios/AppIconPlugin.swift` / `.m` / `BridgeViewController.swift` を Xcodeの `App` グループに追加（Target Membership: App）
2. `Main.storyboard` を開き、ルートのView Controllerを選択 → Identity Inspector → Custom Class を `CAPBridgeViewController` から `BridgeViewController` に変更

この2つを両方やらないと、`setNativeAppIcon` 呼び出し時に `"AppIconPlugin" plugin is not implemented on ios` (UNIMPLEMENTED) エラーになる（Target Membershipだけ・CAP_PLUGINマクロだけでは自動登録されない）。

---

## ホーム画面ウィジェット（次の予定 & 買い物リスト・2カラム統合）

iOS標準のホーム画面ウィジェット（WidgetKit）。1つの大きいウィジェット（systemLarge）の中で左カラムに「次の予定」（最大4件、時刻付き）、右カラムに「買い物リスト」（最大6件）を表示する。**iOS 17+のインタラクティブウィジェット機能を使い、各行をタップするとその場でタスク完了／購入済みにできる。**

### データの流れ（アプリ → ウィジェット）

1. `src/app/page.tsx` の App コンポーネントに、`tasks`/`shopItems`/`now`/`settings.theme` が変わるたびに次の予定4件・未購入アイテム6件・現在のテーマカラーを計算して `updateWidgetData()` を呼ぶ `useEffect` がある（各アイテムに `id` を含める。後述のタップ完了機能で必須）
2. `src/app/components/WidgetData.ts` — `updateWidgetData(tasks, shopItems, themeColor)` がCapacitorカスタムプラグイン `WidgetDataPlugin` を呼ぶ（Web/開発環境では何もしない）
3. `native-ios/WidgetDataPlugin.swift` / `.m` — JSON文字列とテーマカラー(hex文字列)をApp Group共有の `UserDefaults(suiteName: "group.jp.brainbox.app")` に書き込み、`WidgetCenter.shared.reloadAllTimelines()` でウィジェットを更新する
4. `native-ios/Widgets/BrainBoxWidgets.swift` — 実際のウィジェット表示（Widget Extensionターゲット用、`CombinedWidget` 1つのみ）。同じApp Groupから読み取って描画する。時刻・チェックアイコンの色はアプリの現在のテーマカラーに追従する（`Color(hex:)` extensionでhex文字列から変換）

### データの流れ（ウィジェット → アプリ、タップ完了機能）

ウィジェットは別プロセス（Widget Extension）で動くため、タップしても直接 `tasks`/`shopItems` state は変更できない。「保留アクション」をApp Group経由でアプリに伝えるしくみになっている。

1. `native-ios/Widgets/WidgetIntents.swift` — `CompleteTaskIntent` / `PurchaseShopItemIntent`（`AppIntent`、iOS 17+）。ウィジェットの行をタップすると実行され、そのIDを `UserDefaults` の `pendingCompletedTaskIds` / `pendingPurchasedShopItemIds`（JSON配列文字列）に追記し、`WidgetCenter.shared.reloadAllTimelines()` でウィジェットを即時更新する
2. `BrainBoxWidgets.swift` の `loadTasks()` / `loadShopItems()` は、pending済みのIDを除外して表示する（＝タップした瞬間にウィジェット上から消える、楽観的UI）
3. `WidgetDataPlugin.swift` の `getPendingWidgetActions()` — pending配列を読み取って返し、読み取り後は `UserDefaults` から削除する
4. `src/app/components/WidgetData.ts` の `getPendingWidgetActions()` がこれを呼ぶ
5. `src/app/page.tsx` の App コンポーネントに、アプリ起動時と `document.visibilitychange`（アプリが前面に戻ったタイミング）で `getPendingWidgetActions()` を呼び、返ってきたIDに対応する `tasks`/`shopItems` を `completed:true` / `checked:true` に更新する `useEffect` がある

つまり、ウィジェットをタップした直後はウィジェット上でだけ消え、実際に `tasks`/`shopItems` に反映されるのはアプリを開いた時（またはvisibilitychange発火時）。若干のタイムラグがあるのは仕様。

### Xcodeでの手動セットアップ（`ios/`はgitignore対象なので毎回必要）

**① App Group を作成（メインAppターゲット）**

1. `App` ターゲット → 「Signing & Capabilities」→「+ Capability」→「App Groups」
2. `group.jp.brainbox.app` を追加

**② WidgetDataPlugin を追加（メインAppターゲット、AppIconPluginと同じ手順）**

1. `native-ios/WidgetDataPlugin.swift` / `.m` を `ios/App/App/` に追加（Target Membership: App）
2. `native-ios/BridgeViewController.swift` の `capacitorDidLoad()` に `bridge?.registerPluginInstance(WidgetDataPlugin())` の行があることを確認（無ければ手動で追記。すでに `ios/App/App/BridgeViewController.swift` がある場合、`git pull` しても自動反映されないので **Xcode上で直接編集** すること）

**③ Widget Extension ターゲットを新規作成**

1. Xcodeメニュー File → New → Target → 「Widget Extension」を選択
2. Product Name: `BrainBoxWidgets`（任意）、"Include Live Activity" と "Include Control" は**オフ**、"Include Configuration App Intent" も**オフ**
3. 作成すると自動生成される雛形の `.swift` ファイル（サンプルWidgetコード）は削除する
4. `native-ios/Widgets/BrainBoxWidgets.swift` と `native-ios/Widgets/WidgetIntents.swift` をこの **Widget Extension ターゲット**に追加（Target Membership: BrainBoxWidgetsExtension。メインAppターゲットには入れない）
5. Widget Extensionターゲットにも①と同じ「Signing & Capabilities」→「App Groups」→ `group.jp.brainbox.app` を追加（メインAppと共有するため両方に必要）
6. Widget Extensionターゲットの「General」→「Minimum Deployments」を **iOS 17.0以上**に設定する（`Button(intent:)` のインタラクティブウィジェットAPIがiOS 17+のため。メインAppターゲットはiOS 15.0のままでよい）

**④ ビルド・実機確認**

1. メインの `App` スキームのままビルド・実行（Widget Extensionは自動的に埋め込まれる）
2. 実機のホーム画面で長押し →「ウィジェットを追加」→「BrainBox」を検索 →「次の予定 & 買い物リスト」（systemLarge）を追加
3. 行をタップ →その場でウィジェットから消える→ アプリを開くと実際に完了/購入済みになっていることを確認

### 避けるパターン

- `WidgetDataPlugin` を Widget Extension ターゲットに追加しない（メインAppターゲットのみ。データを書き込む側と読み取る側が逆）
- `BrainBoxWidgets.swift` / `WidgetIntents.swift` をメインAppターゲットに追加しない（Widget Extensionターゲットのみ）
- App Group ID をメインAppとWidget Extensionで一致させ忘れる（`group.jp.brainbox.app` で統一）
- Widget Extensionターゲットの Minimum Deployment を iOS 17 未満のままにする（`Button(intent:)` がビルドエラーになる）
- `WidgetTaskItem` / `WidgetShopItem` の `id` を JS側の送信データから外す（タップ完了機能がどのアイテムか特定できなくなる）

---

## 買い物リストの場所通知（GeofencePlugin）

登録した場所（緯度経度＋半径）に近づいたら、iOSのバックグラウンド位置情報とジオフェンス（`CLCircularRegion` monitoring）でローカル通知を出す機能。時間指定通知（`ShopNotifPanel`）とは独立した別機能で、両方同時に設定できる。

### 型・保存キー

```typescript
interface ShopLocation { id: string; name: string; lat: number; lng: number; radius: 100|300|500; enabled: boolean; }
const SHOP_LOC_KEY = 'tl-shop-loc-v1';
```

### UI

`ShopLocationPanel`（`src/app/page.tsx`）— `ShopNotifPanel` のすぐ下に並べて表示する。表示箇所は2箇所（どちらも同じ props を渡す）：

1. `BottomTabs` の買い物タブ内、ベルアイコンで開く `showShopNotif` パネル
2. 設定 → 通知 → 買い物リスト（`SettingsScreen` の `sub==='notifications-shop'`）

**登録フロー:** 「追加」→ 場所検索（[Nominatim](https://nominatim.openstreetmap.org/search)をAPIキー無しで直接fetch）／「地図で指定」／「現在地から登録」（現在地取得は後述の `getCurrentCoords()` 経由）→ 半径（100/300/500m）を選択→登録。登録時に `ensureGeofencePermission()` で位置情報「常に」＋通知の許可をリクエストし、拒否されている場合は許可されるまで登録しない。「地図で指定」は地図をブロックせず即座に表示し、裏で現在地取得を試みてピンを自動的に現在地へ寄せる（失敗時は東京駅付近の既定値のまま静かにフォールバック）。「現在地から登録」は取得完了を待ってから地図を現在地中心で開く。

**現在地取得は `navigator.geolocation` を使わない（重要・過去の不具合）:** 当初 `navigator.geolocation.getCurrentPosition`（WKWebView標準Web API）で実装していたが、**実機で位置情報の許可（「共有時」）が下りている状態でも、成功・失敗どちらのコールバックも一切呼ばれずに永久に固まる**という不具合が実際に発生した（ブラウザ版では同じコードで問題なく動作するため、Capacitorが独自スキーム`capacitor://localhost`でコンテンツを配信するWKWebView環境特有の問題と判明。`@capacitor/geolocation`という専用npmプラグインが存在するのもこの信頼性問題が理由）。この修正以降、現在地取得は `src/app/page.tsx` の `getCurrentCoords(timeoutMs)` を経由すること。ネイティブでは `GeofencePlugin.getCurrentLocation()`（`CLLocationManager.requestLocation()` を直接呼ぶ）を使い、Web/開発環境のみ `navigator.geolocation` にフォールバックする。`useMyLocation`（`ShopMapPicker`のクロスヘアボタン）・地図オープン時の自動現在地寄せ・`useCurrentLocation`（「現在地から登録」）はすべてこの関数経由。

**検索API: Nominatim（住所検索APIから切り替え済み）** 国土地理院の住所検索APIは正式な住所（町名・字名）専用で、「イオンモール福岡」のような施設名・ランドマーク名を検索すると無関係な住所がヒットすることがあった（例: クエリ中の「イ」だけが千葉県のある地区の字名と偶然一致してしまう）。Nominatim（OpenStreetMapのジオコーダー）はPOI・施設データも持っているため施設名検索の精度が高い。`https://nominatim.openstreetmap.org/search?format=json&q=...&countrycodes=jp&limit=8&accept-language=ja` を直接fetchし、`display_name`/`lat`/`lon`（lat/lonは文字列なのでparseFloat）を使う。CORSキー不要・ブラウザの`Referer`ヘッダーで利用規約上の送信元識別要件を満たす。逆ジオコーディング（座標→住所名）は引き続き国土地理院の[逆ジオコーディングAPI](https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress)を使用（こちらは正式住所を返す用途なので問題ない）。

位置情報または通知が拒否されている場合、パネル上部に設定アプリへの案内文を表示する（`checkGeofencePermissions()` で状態確認）。

**地図ピッカー（`ShopMapPicker`）:** 追加npmライブラリ無しでCARTO Voyagerのラスタタイル（`https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png`、APIキー不要・Googleマップに近い見やすい配色）を直接fetchして3x3グリッドで描画する自前の軽量地図。標準のOpenStreetMapタイル（`tile.openstreetmap.org`）は見づらいとのフィードバックがあり切り替え済み。ピンは画面中央に固定表示、ドラッグで地図側を動かして位置を決める（Google/Appleマップと同じUX）。2本指ピンチで拡大縮小もできる（`pinchScale`でタイル層のみを視覚的にscale()し、指を離した時点で最も近い整数ズームに丸めてタイルを再取得。タッチイベントは`e.stopPropagation()`でボトムシートのタブ切り替えスワイプに伝播しないようにしている）。座標⇔ピクセル変換は標準的なWeb Mercatorタイル計算（`lonLatToPx`/`pxToLonLat`、CARTO Voyagerも256pxのOSM互換タイルなので変換ロジックは共通）。確定時は国土地理院の逆ジオコーディングAPIで地名を試みに取得し、失敗時は「地図で指定した場所」にフォールバックする。CARTOの利用規約上、地図上に「© CARTO © OpenStreetMap」表記を常時表示している。

- **地図内検索:** 地図の上部に検索バーがあり、Nominatimでの検索結果をタップすると地図がその位置に再センタリングされる（ドラッグ不要で直接ジャンプできる）
- **現在地表示:** 地図左下の照準アイコン（`AppIcons.crosshair`）をタップすると `getCurrentCoords()` で現在地を取得し、地図を現在地に再センタリング＋青い現在地ドット（`myLocation` state）を表示する。中央固定ピンとは別レイヤーで、ドラッグしても現在地ドットの実座標は変わらず、画面内の相対位置だけが再計算される
- 確認ステップ（半径選択画面）の場所名は編集可能な入力欄になっている（検索結果や逆ジオコーディングの結果を初期値にしつつ、登録前に自由に書き換えられる）

**登録済み場所の名称変更:** `ShopLocationPanel` の一覧で場所名をタップするとインライン編集になる（`editingId`/`editingName` state、Enterまたはフォーカス外れで確定）。`CustomTab` のインライン名前編集と同じUXパターン。

本物のGoogleマップ/Apple MapKitへの変更も可能だが、それぞれAPIキー発行・課金設定（Google）またはMapKit JS用の秘密鍵発行・JWT設定（Apple）というユーザー側の作業が必要なため、現状は無料でAPIキー不要なCARTO Voyagerを採用している。

**PRO機能:** 「場所で通知」は課金機能。`isPremium` が false の場合、ヘッダーに ★ PRO バッジを表示し、「追加」ボタンや既存の場所を再度ONにする操作は `ProGateSheet` を表示してブロックする（OFFにする操作は常に許可）。`ShopLocationPanel` は `isPremium`/`onProPrompt` を props として受け取り、呼び出し元（`BottomTabs`・`SettingsScreen`）がそれぞれ自前の `ProGateSheet` 表示状態を持つ。ブラウザ・開発環境は `usePremium()` が常に `isPremium=true` を返すため、このゲートは実機の未購入状態でのみ確認できる。

### データの流れ（アプリ → ネイティブ：ジオフェンス登録）

1. `src/app/page.tsx` の App コンポーネントに、`shopLocations` が変わるたびに enabled な場所だけを `setShopGeofences()` に渡す `useEffect` がある
2. `src/app/components/Geofence.ts` — `setShopGeofences()` / `checkGeofencePermissions()` / `ensureGeofencePermission()` / `getPendingGeofenceAction()` がCapacitorカスタムプラグイン `GeofencePlugin` を呼ぶ（Web/開発環境では常に許可済み扱いで何もしない）
3. `native-ios/GeofencePlugin.swift` — `CLLocationManager` で `CLCircularRegion`（identifier: `shop-<id>`）を監視登録する。呼ばれるたびに既存の `shop-` prefix リージョンを全解除してから登録し直す（差分更新はしない）

### 通知の発火（ネイティブ側で完結、JSは介さない）

バックグラウンド／未起動でも動く必要があるため、リージョン進入の検知から通知表示まで全て `GeofencePlugin.swift` 内で完結する。JS側のタスク通知（`new Notification(...)`、フォアグラウンド前提）とは別の仕組み。

1. `didEnterRegion` で発火。**同じ場所への連続通知を防ぐため** `UserDefaults.standard` に `geofenceLastNotified_<id>` タイムスタンプを記録し、2時間以内の再進入は無視する
2. 買い物リストの中身は、ウィジェット用に既に書き込まれている App Group の `widgetShopJson`（`WidgetDataPlugin` が更新）をそのまま読む。**未購入アイテムが0件なら通知しない**
3. 場所の表示名は `setGeofences` 呼び出し時に `UserDefaults.standard` の `geofenceNames`（id→name の辞書）に保存しておいたものを使う
4. `UNUserNotificationCenter` に直接ローカル通知を `add()` する（`UNUserNotificationCenterDelegate` は `GeofencePlugin.load()` で自身をdelegateに設定済み。AppDelegate.swiftの編集は不要）
5. 通知タップ時（`didReceive response`）— `UserDefaults.standard` に `pendingOpenShopList=true` を立てる。JS側は `getPendingWidgetActions()` と同じ `visibilitychange`/起動時ポーリングの中で `getPendingGeofenceAction()` を呼び、trueなら `setActiveTab('shop')` で買い物リストを開く

この`didReceive`ハンドラは`UNUserNotificationCenterDelegate`としてアプリ全体で1つしか存在しない（`GeofencePlugin.load()`で設定）ため、**他のプラグインが作った通知でも`userInfo["openShop"]==true`さえ立てておけば同じタップ処理が効く**。`LocalNotifyPlugin.swift`の`syncShopNotifs()`（買い物リストの時間指定通知）はこの仕組みを使って、JS側で`openShop:true`を付けたアラートだけ`content.userInfo=["openShop":true]`を設定している（`scheduleAlerts()`内、`ScheduledAlert.openShop`）。

### Xcodeでの手動セットアップ（`ios/`はgitignore対象なので毎回必要）

**① GeofencePlugin を追加（メインAppターゲット、WidgetDataPluginと同じ手順）**

1. `native-ios/GeofencePlugin.swift` / `.m` を `ios/App/App/` に追加（Target Membership: App）
2. `native-ios/BridgeViewController.swift` の `capacitorDidLoad()` に `bridge?.registerPluginInstance(GeofencePlugin())` があることを確認（無ければ追記。既存の `ios/App/App/BridgeViewController.swift` は `git pull` で自動反映されないので **Xcode上で直接編集**）
3. App Group（`group.jp.brainbox.app`）はWidget機能ですでに追加済みならそのまま共用でよい（未追加なら「Signing & Capabilities」→「+ Capability」→「App Groups」→ `group.jp.brainbox.app`）

> `GeofencePlugin.swift`/`.m` を編集した場合、既存の `ios/App/App/` 内のファイルは `git pull` しても自動更新されない（`ios/` はgitignore対象で、Xcodeに追加した時点でプロジェクト内に物理コピーが作られているため）。`getCurrentLocation` 追加時のように内容を変更した際は、`native-ios/` の最新内容を都度Xcode上のファイルにコピーし直す（既存ファイルを削除して `native-ios/` から追加し直すのが確実）。

**② Info.plist にキーを追加**

`native-ios/GeofenceInfo.plist.snippet.xml` の内容を `ios/App/App/Info.plist` の `<dict>` 直下に追加する（位置情報の許可説明文＋ `UIBackgroundModes: location`）。`UIBackgroundModes` キーがすでに存在する場合は配列に `location` を追記するだけでよい。

**③ Background Modes capability**

`App` ターゲット → 「Signing & Capabilities」→「+ Capability」→「Background Modes」→ **Location updates** にチェック。

**④ ビルド・実機確認**

1. メインの `App` スキームでビルド・実行
2. 設定 → 通知 → 買い物リストから場所を登録し、位置情報「常に」と通知を許可
3. 実機を対象エリア外に持ち出してから接近させ、バックグラウンド/アプリ終了状態でも通知が来ることを確認（シミュレータではリージョン進入をXcodeのDebug → Simulate Locationで模擬できるが、実機推奨）

### 避けるパターン

- ジオフェンス発火時の通知処理をJS側（`new Notification(...)`）で行おうとしない（バックグラウンド/未起動では動かない。必ず `GeofencePlugin.swift` 内の `UNUserNotificationCenter` 直接呼び出しで完結させる）
- 位置情報を通知判定以外の用途で保存・送信しない（サーバー送信や履歴保存はしない。`UserDefaults` に保存するのはクールダウン用タイムスタンプと場所名の辞書のみ）
- `AppDelegate.swift` を編集して `UNUserNotificationCenterDelegate` を設定しようとしない（`GeofencePlugin.load()` 内で完結させる設計にしてあるため不要）
- 現在地の一度きりの取得に `navigator.geolocation` を直接使わない（実機でコールバックが一切呼ばれず固まる不具合の実績あり。`GeofencePlugin.getCurrentLocation()` を使う `getCurrentCoords()` 経由にすること）

---

## 「あとでやる」の場所通知（PRO機能）

買い物リストの場所通知（`ShopLocation`）とは別に、個別の「あとでやる」タスクにも場所を設定し、到着時に通知できる。買い物リストの場所通知と同じ `GeofencePlugin`/`CLLocationManager` を共有するが、`"task-loc-"` prefixで完全に別管理する（`"shop-"` prefixとは独立）。

### 型・保存

`Task.locationNotify?:boolean` / `Task.location?:{name:string;lat:number;lng:number}`。半径は初回実装では固定値 `TASK_LOCATION_RADIUS_M=200`（m）。

### タスク作成・編集画面（TaskModal、`mode==='later'`限定）

「場所で通知」ON/OFFトグル → ONにすると場所検索（Nominatim）・地図で指定（`ShopMapPicker`を再利用）・現在地から登録、のいずれかで場所を選び、確認ステップで名前を編集して「設定する」。確定時に `ensureGeofencePermission()` で位置情報・通知の許可を確認し、拒否された場合は場所通知を有効にしない（`locError`にメッセージ表示）。**場所通知はPRO限定**（非PROで ON にしようとすると `ProGateSheet` を表示）。

**OFFにした時点で場所情報も削除する**（初回実装のシンプルな仕様。`toggleLocationNotify()`が`locationNotify`と`location`を同時にクリアする）。

**登録上限（`MAX_MONITORED_REGIONS=19`）:** `CLLocationManager`が同時監視できるリージョンはアプリ全体で20件までで、買い物リストの場所通知と予算を共有する。`App`コンポーネントの`activeLocationRegionCount`（有効な買い物場所通知数＋他タスクの場所通知数）が上限に達している状態でONにしようとすると、`locError`に「場所通知の登録上限に達しています。他の場所通知をオフにしてから追加してください。」を表示してブロックする。

### タイムラインとの連携・時間通知とのOR条件

タイムラインにドロップして時間指定タスクになっても（`isLater`がfalseになっても）`locationNotify`/`location`は維持される。これはApp側の場所通知同期エフェクトが `isLater` で絞り込まず `!t.completed && t.locationNotify && t.location` だけでフィルタしているため、特別な分岐は不要（既存の「`tasks`変更のたびに全解除→再登録」という設計そのもので自然に実現している）。

ドロップ時に時間通知（`notifications:[0]`＝開始時刻ちょうど）が付くのは、ドラッグ&ドロップ・空き時間カードからの予定化で既存から入っている挙動（`scheduleInSlot`/ドラッグの`onEnd`が`notifications`が空なら`[0]`を補う）で、今回新たに実装したものではない。結果として「時間通知（開始時刻）」と「場所通知（到着時）」がOR条件で両方セットされる状態になる。

### 通知の重複防止（1タスク1回のみ）

`GeofencePlugin.swift`の`didEnterRegion`→`handleTaskLocationEnter()`が発火時に:
1. `taskLocationFired_<taskId>`フラグを立てる（多重発火防止）
2. 通知を表示（title=タスク名、body="この場所に着きました。"、`userInfo:["openLater":true]`）
3. そのリージョンの監視を`stopMonitoring`で止める
4. 残っている時間通知（`task-alert-<taskId>-*`）があれば`removePendingNotificationRequests`で解除する（OR条件のもう片方を消す）

逆方向（時間通知が先に発火した場合）は、`willPresent`デリゲートでアプリがフォアグラウンドの間だけ、発火した`task-alert-`通知のtaskIdを特定して対応する`task-loc-`リージョンの監視を止める。**アプリがバックグラウンド/未起動の間に時間通知が先に発火した場合は、この即時キャンセルができない**（iOSには「予約済みローカル通知が配信された瞬間」にコードを実行するAPIが無いため）。この場合は次にアプリを開いた時点で以下の`getFiredTaskLocationIds()`によるリコンサイル、または単純にユーザーがタスクを完了させることで場所通知も解除される。ごく稀に両方の通知が届く可能性がある既知の制限として割り切っている（初回実装の範囲）。

`setTaskLocationGeofences()`は登録のたびに`taskLocationFired_<id>`が立っているエントリをスキップする（アプリがバックグラウンドの間に他の理由で`tasks`が変わり再同期が走っても、発火済みのリージョンを誤って再武装しないため）。

### アプリ再開時のリコンサイル（`getFiredTaskLocationIds`）

バックグラウンド中に場所到着で発火したタスクIDは、アプリがフォアグラウンドに戻ったタイミング（`visibilitychange`）で`getPendingWidgetActions`/`getPendingGeofenceAction`と同じ`applyPending()`内から`getFiredTaskLocationIds()`を呼んで取得し、該当タスクの`locationNotify`を`false`にする（`location`も削除）。これにより次回の同期対象から確実に外れ、ネイティブ側の発火済みフラグも読み取り時にクリアされる。

### タスク完了・削除時

特別な解除コードは無い。場所通知の同期エフェクトが`tasks`の変更のたびに`!t.completed`かつ`locationNotify`のタスクだけを全解除→再登録するため、完了（`completed:true`）または削除（`tasks`配列から除去）すれば次の同期で自動的に対象から外れる。

### 通知タップ時の画面遷移

買い物リストの場所通知と同じ`UNUserNotificationCenterDelegate`（`GeofencePlugin.load()`で設定済み）を使う。`userInfo:["openLater":true]`を見て`pendingOpenLaterList`フラグを立て、JS側は`getPendingGeofenceAction()`の戻り値`shouldOpenLater`を見て`setActiveTab('later')`で「あとでやる」を開く（`shouldOpenShop`と同じ仕組み、返り値の形が`boolean`から`{shouldOpenShop,shouldOpenLater}`に変わった点に注意）。

### Xcodeでの手動セットアップ

`GeofencePlugin.swift`/`.m`は新規ファイルではなく**既存ファイルの更新**なので、Xcode上の同名ファイルの中身をこの変更後の内容に差し替える（買い物リストの場所通知で使っていたファイルと同じ物理ファイル）。App Group・Info.plist・Background Modesは買い物リストの場所通知ですでに設定済みならそのまま流用でき、追加設定は不要。

### 避けるパターン

- 場所通知の発火判定・重複防止ロジックをJS側だけで完結させようとしない（バックグラウンド/未起動で動く必要があるため、`didEnterRegion`/`willPresent`内のネイティブコードが主役）
- `setTaskLocationGeofences()`で発火済み（`taskLocationFired_<id>`）のエントリを無条件に再登録しない（バックグラウンド中の再同期で誤って再武装され、二重発火の原因になる）
- 「あとでやる」以外のタスク（時間指定・繰り返し）に場所通知UIを表示しない（`mode==='later'`限定。初回実装の対象外）
- 場所通知をOFFにした時に`location`を残さない（初回実装は「OFFで場所情報も削除」という単純な仕様を採用済み）

---

## 忘れ物防止アラート（設定 → 忘れ物防止アラート、PRO機能）

「あとでやる」とは完全に独立した機能。「何をするか」ではなく「何を持っていくか」を管理する（例: 自宅を出るときに財布・鍵・社員証を確認）。買い物リスト・タスクの場所通知と同じ`GeofencePlugin`/`CLLocationManager`を共有するが、`"forget-"` prefixで別管理し、**到着(Enter)ではなく退出(Exit)をトリガーにする点が他の場所通知と異なる**（初回実装ではExitのみ対応、Enter/滞在通知は将来拡張）。

### 型・保存

```typescript
interface ForgetAlert {
  id: string; name: string; location: { name:string; lat:number; lng:number };
  weekdays: number[]; timeStart?: string; timeEnd?: string; enabled: boolean; items: string[];
}
```
`FORGET_ALERTS_KEY='tl-forget-alerts-v1'`に配列で保存。`weekdays`は`0=日〜6=土`。`timeStart`/`timeEnd`は両方空なら終日対象。半径は他の場所通知と同じ`TASK_LOCATION_RADIUS_M=200`固定（設定項目に無いため）。

### 管理画面（`ForgetAlertsPanel`、設定 → 忘れ物防止アラート）

専用のフルスクリーン画面ではなく設定画面のサブ画面（`sub==='forgetAlerts'`）として実装（初回実装の方針通り）。一覧はカード形式で「{name}を出るとき」＋曜日・時間帯のサマリ＋確認する持ち物のチップ＋ON/OFFトグル＋削除ボタン。追加/編集フォームは`ShopLocationPanel`と同じ場所検索（Nominatim）・地図で指定（`ShopMapPicker`再利用）・現在地から、のパターンに加えて曜日選択（`ShopNotifPanel`と同じ7つの丸ボタン）・時間帯（開始/終了の`<input type="time">`、任意）・持ち物チップ入力（追加・×で削除）を持つ。保存時に`ensureGeofencePermission()`で位置情報・通知の許可を確認し、拒否時は登録しない。

**バリデーション:** 名前・場所・曜日1つ以上・持ち物1つ以上が揃うまで「登録」ボタンは無効。

### 登録上限の共有

買い物リストの場所通知・タスクの場所通知と同じ`CLLocationManager`の20リージョン上限を共有する。`App`コンポーネントの同期エフェクトが、それぞれ他の2つのカテゴリの現在の有効数を差し引いた予算内に収まるよう`slice()`する（`MAX_MONITORED_REGIONS=19`）。

### ネイティブ実装（`GeofencePlugin.swift`）

- `setForgetAlerts()` — 他の`set*Geofences`系と同じ全解除→再登録方式。`region.notifyOnExit=true, notifyOnEntry=false`で登録する点が唯一の違い。曜日・持ち物等のメタデータは`UserDefaults`の`forgetAlertData`（id→`ForgetAlertEntry`の辞書）に保存する
- `didExitRegion`（このプラグインで新規追加したデリゲートメソッド。他の場所通知は全てEnterトリガーのため今まで実装していなかった）→ `handleForgetAlertExit()`が本体
- **曜日・時間帯の判定は発火時点（=退出した瞬間）の現在時刻でネイティブ側が行う**（JS側で事前計算はできない。時間指定通知や締切通知と違い、いつ退出するか分からないため）。`Calendar.current.component(.weekday:)`はSunday=1〜Saturday=7なので、JS側の`0=日〜6=土`に合わせるため`-1`する
- 時間帯が日をまたぐ場合（例: 22:00〜2:00）は`inSleepWindow`と同様の判定ロジックを踏襲
- **1回きりの通知ではなく、条件を満たすたびに毎回発火する**（タスクの場所通知の「1回のみ・発火後はfired flagで再武装しない」という設計とは異なる。習慣的なリマインダーなのでOFFにしない限り繰り返し届くのが正しい仕様）
- GPS境界付近でのジッターによる連続発火だけを防ぐため、`forgetAlertLastNotified_<id>`による短いクールダウン（`forgetCooldown=10分`。買い物リストの場所通知の2時間クールダウンより大幅に短い）を設ける

### Xcodeでの手動セットアップ

`GeofencePlugin.swift`/`.m`は新規ファイルではなく**既存ファイルの更新**なので、Xcode上の同名ファイルの中身をこの変更後の内容に差し替える。App Group・Info.plist・Background Modesは買い物リストの場所通知ですでに設定済みならそのまま流用でき、追加設定は不要。

### 避けるパターン

- 忘れ物防止アラートの発火判定（曜日・時間帯チェック）をJS側で事前計算しようとしない（退出タイミングが予測できないため、`didExitRegion`内で発火時点の現在時刻を見て判定する必要がある）
- 忘れ物防止アラートに「1タスク1回のみ」の発火済みフラグ（タスクの場所通知と同じ仕組み）を導入しない（習慣リマインダーなので毎回の退出で繰り返し通知するのが正しい仕様。短いクールダウンでのGPSジッター対策のみ行う）
- 「あとでやる」のUI・データ構造（`Task.locationNotify`）を流用しない（`ForgetAlert`という独立した型・保存キー・ネイティブprefixを持つ別機能として実装済み）

---

## 放置タスク通知・アプリ起動リマインダー（設定 → 通知 → 放置タスク）

`sub==='notifications-later'` 画面（`SettingsScreen`）に2つの独立したリマインダー設定がある。

### 放置タスク通知（既存機能・一部PRO化済み）

`Settings.laterReminderHours`（`LATER_REMINDER_OPTS`: オフ/1時間/3時間/6時間/12時間/1日/2日/3日）。**「オフ」と「3日」のみ無料。それ以外（1時間〜2日）はPRO。** 非PROで選ぶと `setProPrompt('放置タスク通知の間隔変更')` で `ProGateSheet` を表示し、選択中のボタンに `AppIcons.lock`（小さい鍵アイコン、テキストの左）を表示する。タスク実行判定自体は既存のJS側 `useEffect`（`now` ベースのポーリング、フォアグラウンド時のみ動作）。**就寝〜起床の時間帯（`inSleepWindow()`）は通知しない**（判定タイミングがたまたま就寝時間中だった場合はスキップされ、次に起きている時間帯にポーリングが走った時に改めて判定される）。

### アプリ起動リマインダー（一部PRO化済み）

`Settings.appInactivityHours`（`APP_INACTIVITY_OPTS`: オフ/6時間/12時間/1日/2日/3日、デフォルト6時間）。「一定時間アプリを開いていない場合に通知する」機能。**放置タスク通知とは独立した別機能**（あとでやるタスクの有無に関係なく、単純にアプリを開いた/開いていない時間で判定）。**「オフ」とデフォルト値の「6時間」のみ無料。それ以外（12時間〜3日）はPRO。** 非PROで選ぶと `setProPrompt('アプリ起動リマインダーの間隔変更')` で `ProGateSheet` を表示し、選択中のボタンに `AppIcons.lock` を表示する（放置タスク通知と同じパターン）。

タスクリマインダーと違い、アプリがバックグラウンド/未起動でも数時間〜数日後に発火する必要があるため、JSのタイマーでは実現できない（プロセスが生きている保証がない）。iOSネイティブの `UNTimeIntervalNotificationTrigger` で完結させる。

**就寝時間帯を避ける調整:** バックグラウンドに移る瞬間（`document.visibilitychange`）に `Date.now()+hours*3600*1000` で発火予定時刻を計算し、`inSleepWindow()` でその時刻が就寝〜起床の時間帯に重なるか判定する。重なる場合は起床時刻まで後ろ倒しした時間差を計算し直す（ネイティブ側の `UNTimeIntervalNotificationTrigger` は相対時間しか扱えないため、時刻の調整はJS側で行う）。

**未解決なら再通知する（`STALE_REPEAT_HOURS`/`STALE_MAX_REPEATS`、放置タスク通知と共通の定数）:** アプリが開かれないままだと、最初の通知（`hours`時間後）に加えて `STALE_REPEAT_HOURS`（6時間）おきに最大 `STALE_MAX_REPEATS`（5回）ぶんの通知をまとめて事前予約する。`scheduleInactivityReminder()` には単一の`hours`ではなく、この一連の時間数（`hoursList: number[]`）を渡す。アプリを開けば`cancelInactivityReminder()`で全件まとめて取り消される。

**データの流れ:**

1. `src/app/page.tsx` の App コンポーネントに `document.visibilitychange` を監視する `useEffect` があり、
   - **バックグラウンドに移った瞬間**（`visibilityState==='hidden'`）→ 最初の通知＋再通知ぶんの時間数配列（`hoursList`）を計算して `scheduleInactivityReminder(hoursList)` を呼ぶ
   - **フォアグラウンドに戻った瞬間**（`visibilityState==='visible'`）→ `cancelInactivityReminder()` で予約済みの通知を全て取り消す（アプリを開いたのでタイマーをリセットする意味）
   - `settings.appInactivityHours<=0`（オフ）の場合は常に `cancelInactivityReminder()` のみ呼ぶ
   - `settings.notificationsEnabled` が false の場合はスケジュールしない
2. `src/app/components/Inactivity.ts` — `scheduleInactivityReminder(hoursList)`/`cancelInactivityReminder()` がCapacitorカスタムプラグイン `InactivityPlugin` を呼ぶ（Web/開発環境では何もしない）
3. `native-ios/InactivityPlugin.swift` — `scheduleReminder()` は既存の `app-inactivity-reminder-` prefixの予約を全解除してから（重複防止・タイマーリセット）、`hoursList`の各要素ごとに `UNTimeIntervalNotificationTrigger(timeInterval: hours*3600, repeats:false)` で1件ずつ（識別子 `app-inactivity-reminder-${index}`）予約し直す。`cancelReminder()` は同prefixの予約済みリクエストを全て削除するだけ

### Xcodeでの手動セットアップ（`ios/`はgitignore対象なので毎回必要）

`native-ios/InactivityPlugin.swift` / `.m` を `ios/App/App/` に追加（Target Membership: App）。`native-ios/BridgeViewController.swift` の `capacitorDidLoad()` に `bridge?.registerPluginInstance(InactivityPlugin())` があることを確認（無ければ追記。既存の `ios/App/App/BridgeViewController.swift` は `git pull` で自動反映されないので **Xcode上で直接編集**）。App Group・Background Modes・Info.plistの追加設定は不要（ジオフェンスと違い常にフォアグラウンド起点でスケジュールするだけなので、バックグラウンド位置情報等は使わない）。

### 避けるパターン

- アプリ起動リマインダーの発火判定をJS側の `setTimeout`/`setInterval` で行おうとしない（アプリがバックグラウンド/未起動になるとタイマーは動かない。必ずネイティブの `UNTimeIntervalNotificationTrigger` で完結させる）
- フォアグラウンドに戻った時に `cancelInactivityReminder()` を呼び忘れない（呼ばないと、アプリを頻繁に開いていても毎回のバックグラウンド移行で古いタイマーが残ったまま新しい予約と重複し得る。現状は同一IDで上書きされるため実害は少ないが、意図としては「開いたらリセット」が正しい）
- 放置タスク通知（`laterReminderHours`）とアプリ起動リマインダー（`appInactivityHours`）を同じ設定値として扱わない（別々のフィールド・別々のUI・別々のPRO方針）

---

## 主要な型定義

| 型 | 説明 |
|---|---|
| `Task` | id, name, startTime, duration, memo, icon, completed, date, isLater, recurrence, customRec, pinned, tags, notifications, incompleteReminder, category, postponedCount, color, subtasks, photoCount, **deadlineAt?:string, deadlineNotify?:'week'\|'3days'\|'dayBefore'\|'sameDay'\|'auto'（PRO）**, **locationNotify?:boolean, location?:{name,lat,lng}（あとでやる限定・PRO）** |
| `Settings` | wakeTime, sleepTime, **keepIncomplete?:boolean** |
| `FreeSlot` | タイムライン上の空き時間スロット |
| `ShopItem` | 買い物リストのアイテム（7日後に自動削除） |
| `TagDef` | タグ定義（name, color） |
| `CustomRec` | カスタム繰り返し設定 |
| `MoveHistory` | 未完了タスクの「あとでやる」移動履歴 |
| `CustomTab` | ユーザー定義ファイルタブ（`{id:string; name:string}`） |
| `TaskMode` | `'later'` / `'scheduled'` / `'recurring'` |
| `TaskGroupData` | `{startTime, tasks, rows, h}` — タイムラインの時刻グループ |
| `ShopNotifSetting` | 買い物リストの時間指定通知（曜日・時刻） |
| `ShopLocation` | 買い物リストの場所通知（`{id, name, lat, lng, radius:100\|300\|500, enabled}`） |
| `ForgetAlert` | 忘れ物防止アラート（`{id, name, location, weekdays, timeStart?, timeEnd?, enabled, items}`、PRO） |

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
| `SHOP_NOTIF_KEY` | `'tl-shop-notif-v1'` | 買い物リストの時間指定通知設定 |
| `SHOP_LOC_KEY` | `'tl-shop-loc-v1'` | 買い物リストの場所通知設定（`ShopLocation[]`） |
| `FORGET_ALERTS_KEY` | `'tl-forget-alerts-v1'` | 忘れ物防止アラート設定（`ForgetAlert[]`） |
| `ONBOARDING_KEY` | `'tl-onboarding-completed-v1'` | 初回起動オンボーディング完了フラグ |
| `FEATURE_USAGE_KEY` | `'tl-feature-usage-v1'` | 「おすすめ機能」判定用の機能利用履歴（`FeatureUsage`） |
| `RECOMMEND_STATE_KEY` | `'tl-recommend-state-v1'` | 「おすすめ機能」の表示・却下状態（`RecommendationState`） |
| `TOUR_COMPLETED_KEY` | `'tl-product-tour-completed-v1'` | プロダクトツアー完了フラグ |

---

## オンボーディング・おすすめ機能・プロダクトツアー

初回起動時の導線として3つの機能がこの順で連鎖する: **オンボーディング → （通知プロンプト） → 起床・就寝プロンプト → プロダクトツアー**。「おすすめ機能」はこれらとは独立して、インストール後しばらく経ってから条件を満たすたびに表示される。

### オンボーディング（`src/app/components/Onboarding.tsx`）

初回起動時だけ表示する5ページのスワイプ式イントロ（`App`のトップレベルで`showOnboarding`がtrueの間は`Onboarding`を全画面表示し、メインUIは描画しない）。`ONBOARDING_KEY`が無ければ表示。最終ページで通知・位置情報の許可ボタン（`requestNotifyPermission()`/`ensureGeofencePermission()`、ボタンを押した時だけ実行・拒否されても完了可能）。「始める」→`completeOnboarding()`が`ONBOARDING_KEY`と`NOTIF_ASKED_KEY`（オンボーディング内で通知案内済みのため通知プロンプトはスキップ）をセットし、`maybeShowWakeSleepPrompt()`を呼ぶ。

### 起床・就寝プロンプト → プロダクトツアーへの連鎖

`maybeShowWakeSleepPrompt()`は`WAKESLEEP_ASKED_KEY`が既にあれば何もせず`maybeShowProductTour()`を呼ぶ（＝オンボーディングを飛ばして起動した既存ユーザーでもツアーへ繋がる）。プロンプトを表示した場合は`dismissWakeSleepPrompt()`（`confirmWakeSleepPrompt()`もこれを呼ぶ）の中で`WAKESLEEP_ASKED_KEY`セット後に`maybeShowProductTour()`を呼ぶ。

**既にオンボーディング・通知・起床就寝プロンプトを済ませている既存ユーザー**（この機能追加前からのユーザー）は上記チェーンが発火しないため、初回ロードの`useEffect`に`else if(!localStorage.getItem(TOUR_COMPLETED_KEY)){setTimeout(()=>setShowTour(true),1000);}`という最終分岐を追加し、次回起動時にツアーが表示されるようにしている。

### プロダクトツアー（`src/app/components/ProductTour.tsx`）

タスク追加ボタン→空き時間カード→ドラッグ＆ドロップの3ステップのスポットライト型ツアー。`App`の`showTour`がtrueの間、メインUIの上に**オーバーレイ表示**する（オンボーディングと違い実際のUIを隠さない。`modal.open`/`settingsOpen`/`calendarOpen`/`searchOpen`のいずれかがtrueの間は表示しない）。

- 各ステップは`data-tour="fab-add"` / `data-tour="free-time-card"` / `data-tour="tour-draggable"`のCSSセレクタで対象DOM要素を`querySelector`し、`getBoundingClientRect()`で位置を取得（`setInterval(400ms)`＋`resize`/`scroll`で再計測）。
- **スポットライト演出**: 対象要素の四方を覆う4枚の暗転帯（`pointer-events:auto`でタップを吸収）＋ 対象要素ぴったりに重ねる`pointer-events:none`の光る枠（`globals.css`の`tourPulse`/`tourScale`キーフレームで呼吸するようなパルスアニメーション）。対象要素自体には何も重ねないため、実際のボタン操作がそのまま機能する（＝ハイライト部分だけ操作可能、という要件をDOM上の「穴」として実現）。
- 吹き出し（タイトル・本文・矢印）は`globals.css`の`tourBlink`で点滅する三角形の矢印付き。対象が画面下半分にあれば吹き出しは上に、上半分にあれば下に自動配置。
- **ドラッグ＆ドロップのステップだけは「次へ」ボタンを出さず、実際のジェスチャー完了を待つ**: `App`側で既存のドラッグ完了処理（`onEnd`、`dragTask`のuseEffect内）に`setTourDragSignal(n=>n+1)`を追加し、`gestureSignal` propとして`ProductTour`に渡す。ツアー側は「ドラッグ」ステップに入った時点の値を`gestureBaseline`に記録し、それと異なる値になったら（＝実際に何らかのタスクがドラッグ＆ドロップされたら）自動で次へ進む
- **対象要素が見つからない場合**（空き時間が無い日・タスクが1件も無い日など）は800ms待って自動的に次のステップへスキップする（データが無くてもツアーが止まらない）。
- 最終ステップの後は完了画面（チェックアイコン＋「ツアー完了！」＋「はじめる」ボタン）を表示してから`onFinish()`を呼ぶ。「スキップ」ボタンは完了画面を経由せず即座に`onFinish()`を呼ぶ。`onFinish`は`App`側で`TOUR_COMPLETED_KEY`をセットして`showTour`をfalseにする（スキップしても再表示されない）。

### おすすめ機能（未使用機能の段階的な提案）

`RECOMMENDATION_DEFS`（`src/app/page.tsx`）に定義された機能を、未使用のものだけ優先順位順（買い物リスト→場所通知→繰り返しタスク）に1つ、画面下部の小さいカードで提案する。**対象機能を増やす時は`RECOMMENDATION_DEFS`に1件追記するだけでよい。**

```typescript
interface FeatureUsage { installedAt:string; shoppingListUsedAt?:string; locationReminderUsedAt?:string; repeatTaskUsedAt?:string; lastRecommendationShownAt?:string; }
interface RecommendationState { shownCount:number; lastShownAt?:string; dismissedAt?:string; }
type RecommendationId = 'shoppingList'|'locationReminder'|'repeatTask';
interface RecommendationDef { id:RecommendationId; usedKey:keyof Omit<FeatureUsage,'installedAt'|'lastRecommendationShownAt'>; title:string; body:string; cta:string; requiresLocationPermission?:boolean; }
```

- `featureUsage`（`FEATURE_USAGE_KEY`）は初回ロード時に無ければ`{installedAt:new Date().toISOString()}`で作成（＝そのタイミングを「インストール日時」とみなす）
- 利用検知用`useEffect`が`shopItems`/`shopLocations`/`tasks`の変化を見て、各機能が初めて使われた時刻を一度だけ`featureUsage`に記録する（`shopItems.length>0`→買い物リスト、`shopLocations.length>0`→場所通知、`tasks.some(t=>t.recurrence)`→繰り返しタスク）
- `recommendState`（`RECOMMEND_STATE_KEY`、`Partial<Record<RecommendationId,RecommendationState>>`）に機能ごとの表示回数・最終表示日時・却下日時を記録
- **表示条件判定**（`loaded && !showOnboarding && !showTour`のタイミングで6秒後に1回だけ判定、`recommendPickedRef`で1セッション1回に制限）:
  - インストールから3日以上経過していること（`daysBetween`）
  - 前回何らかのおすすめを表示してから2日以上経過していること（`featureUsage.lastRecommendationShownAt`、機能を跨いだグローバルな間隔）
  - 対象機能が未使用であること（`featureUsage[def.usedKey]`が未設定）
  - その機能の表示回数が2回未満であること、却下してから7日未満でないこと
  - 位置情報の許可が必要な機能（`requiresLocationPermission`）は、既に拒否されている場合は提案しない（`checkGeofencePermissions()`で確認。**許可を拒否された機能を再度求めない**という要件のため）
- 条件を満たす最初の1件を`showRecommendation(id)`で表示（`shownCount`をインクリメントし`lastShownAt`/`lastRecommendationShownAt`を更新）
- UIは画面下部（Bottom Barの上）の小さいカード（フルモーダルではない）。「使ってみる」→`useRecommendation()`が該当機能の画面を開く（買い物リスト→`activeTab='shop'`、場所通知→設定の`notifications-shop`サブ画面、繰り返しタスク→`openAdd()`）。「今はしない」→`dismissRecommendation()`が`dismissedAt`を記録して閉じる（7日間は再表示しない）

### 避けるパターン

- オンボーディング・おすすめ機能・プロダクトツアーの3つを同時に表示しない（`showTour`は`showOnboarding`とrecommendation表示条件の両方でガードしている）
- プロダクトツアーの対象要素に`data-tour`属性を付け忘れない（`ProductTour`は`querySelector`でこれらを探すため、対象のJSXを変更する時は属性ごと移動させること）
- 「おすすめ機能」の対象を増やす時、`RECOMMENDATION_DEFS`に追記する以外の分岐（if文の追加等）を作らない（優先順位はこの配列の並び順で決まる設計）

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
- **タスクごとのアラート（`Task.notifications: number[]`、開始時・何分前・前日）は `syncTaskAlerts()` でネイティブに事前予約している**（App コンポーネント、`tasks` 変更のたびに未来の直近60件を計算して `LocalNotifyPlugin.syncTaskAlerts` に渡す）。バックグラウンド/未起動でも発火する。旧来の `now` ポーリング＋即時 `notify()` の `useEffect`（`TASK_ALERT_FIRED_KEY` 使用）はWeb/開発環境専用フォールバックとして残っており、ネイティブでは `isNative()` で早期returnする。新しい通知チェックを追加する際は必ずこの `useEffect` 一覧（複数ある。起床チェックイン・買い物リスト・放置タスク・空き時間提案・タスクアラート（Web fallback）・タスクアラート（ネイティブ事前予約））を grep してから既存パターンに倣うこと
- **アプリ内の全通知は `src/app/components/LocalNotify.ts` の `notify(title, body)` を呼ぶこと。`new Notification(...)` を直接呼ばない。** WKWebViewはWeb Notifications API（`window.Notification`）を実装しておらず、実機では `new Notification(...)` は何も起きずに失敗する（設定アプリのBrainBoxページに「通知」の許可項目自体が出ない＝一度もネイティブの通知許可がリクエストされていない、という形で発覚した実際の不具合）。`notify()` はネイティブでは `LocalNotifyPlugin` 経由で `UNUserNotificationCenter` に直接通知を出し、Web/開発環境では従来通り `window.Notification` にフォールバックする。ただし `notify()` 自体は即時発火なので、呼び出し元の発火判定が `now` ベースのポーリングのままだと**アプリがフォアグラウンドで開かれている間しか動かない**（バックグラウンド/未起動では動かない。それが必要な機能は場所通知・アプリ起動リマインダー・タスクアラートのように専用のネイティブスケジューリング（`syncTaskAlerts`/`GeofencePlugin`/`InactivityPlugin`）が必要）

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

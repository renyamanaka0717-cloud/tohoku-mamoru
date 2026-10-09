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

## 保留中のタスク（次回セッションで続ける）

**Apple Watch版、実機（Apple Watch SE 2nd gen・watchOS 26.6）でのビルド・インストールまでは確認済み。** Xcode実機認識の問題（デベロッパモード・信頼するコンピュータのペアリング情報が古くなっていた）は解消済み——iPhoneをUSB接続した状態でXcode上の信頼関係を一度リセットし、Watch側で再度「信頼する」操作をすることで実機が`Devices and Simulators`に表示され、ビルド・実行できるようになった。

**実機検証で判明した不具合: `.onAppear`直後の即時自動ダイクテーション開始は動作しなかった。** アプリを開いた瞬間に即座に`WKExtension.shared().visibleInterfaceController`を呼ぶと実機では`nil`が返り、常にフォールバックのTextFieldに落ちてしまい、かつ「あとでやるに追加」ボタンとTextFieldが同時に表示される分かりにくい画面になっていた（`WKHostingController`がvisibleInterfaceControllerとして解決されるのに`.onAppear`発火のタイミングでは間に合っていなかったと考えられる）。**一度は自動開始を撤回しタップ起点のみにしたが、ユーザーからの希望で再度自動開始を試みることになり、`.onAppear`から0.4秒遅延させてから`startDictation()`を呼ぶ方式に変更した**（`didAutoStart`フラグで1回限りに制限、フォアグラウンド復帰のたびに二重発火しないようにしている）。idle画面は常にマイクボタンを表示しており、タップ起点のリトライにも同じ`startDictation()`を使う。タップ/自動いずれで呼んでも`visibleInterfaceController`がまだ`nil`だった場合はボタンをフォールバックのTextFieldに差し替える（同時表示はしない。TextFieldには`@FocusState`で自動フォーカスを当てる）。**この0.4秒遅延での自動開始はまだ実機未検証。** 次回セッションで実機確認し、もし依然として`nil`に落ちるようなら遅延を伸ばすか、再度タップ起点のみに戻すこと。

**実機検証で判明した不具合（修正済み）: `WatchBridgePlugin`がiPhone側で未登録だった。** `native-ios/WatchBridgePlugin.swift`ファイル自体はXcodeプロジェクトに追加されていたが、`native-ios/BridgeViewController.swift`の`capacitorDidLoad()`に`bridge?.registerPluginInstance(WatchBridgePlugin())`の行が**抜けていた**ため、Watch側から送信しても`WCSessionDelegate`がiPhone側に存在せず、「あとでやる」に一切反映されない不具合があった。修正してpush済み。**新しいCapacitorプラグインファイルを追加する時は、ファイルを追加しただけで満足せず、必ず`BridgeViewController.swift`（または該当する登録箇所）に`registerPluginInstance`の行も追加したか確認すること**（ファイルが存在するだけでは動かない、という典型的な見落としパターン）。

**実機確認済み: Watch→iPhoneの「あとでやる」反映フローが動作することを確認した。** Watchでダイクテーション→完了→iPhone側でBrainBoxアプリを開く、という流れで実際に「あとでやる」にタスクが追加されることを実機で確認済み。

次回セッションで実機確認すること:
1. アプリを開いて0.4秒後に自動でダイクテーション画面が開くか（開かずフォールバックのTextFieldになる場合は遅延不足の可能性がある。この時点ではまだ未検証）
2. マイクアイコンの色がiPhone側のテーマカラー（未受信時はミント`#94CFC8`にフォールバック）に追従するか（`WatchBridgePlugin.swift`の`updateThemeColor`・`WatchConnector.swift`の`didReceiveApplicationContext`）

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
| `TaskModal` | タスク作成・編集モーダル（繰り返し設定含む） |
| `TaskCard` | タイムライン上のタスクカード（サブタスク・メモプルダウン付き） |
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
| `gkTime(g.startTime)`（`${date}-${g.startTime}`） | 単一タスクグループのカード |
| `task.id` | 同一時刻グループ内の各タスクカード（IDはグローバルに一意なので日付は不要） |
| `gkFree(slot.start)`（`${date}-free-${slot.start}`） | 空き時間カード |

**空き時間カードの後続カード位置にも `measuredH` を反映すること（過去の不具合）:** タイムラインの詰めレイアウト（`dayItems`/`dayPrevBottom`の積み上げ、Timeline内）で、空き時間カードの高さ`h`に`calcFreeContentH(laterPool)`の**見積り値のみ**を使い`measuredH['free-${slot.start}']`を見ていなかったため、「あとでやる」の件数が多くチップが折り返す行数の見積りが実際のflex-wrapレイアウトとズレると、後続カード（次のタスクや就寝カード）が本来より上に配置され、空き時間カードの実際の描画（`minHeight`なので内容に応じて自然に伸びる）と重なってしまう不具合があった。`h:measuredH[`free-${s.start}`]??calcFreeContentH(laterPool)`のように、taskGroupListの`g.h`（`measuredH[g.startTime]??g.h`等）と同じ「実測優先・見積りはフォールバック」パターンに統一して修正済み。空き時間カードのレイアウトに手を入れる時はこの`dayItems`内の`freeSlots.map`箇所を確認すること。

**上記修正が新たな不具合を生んでいた（測定値が過大なまま固定される）:** `data-gk="free-${slot.start}"`のResizeObserver refを、`FreeTimeCard`の**外側**（`minHeight`が適用されている`bg-gray-50`のdivを包む位置）に付けていたため、一度でも`calcFreeContentH`の見積りが実際より大きくなると（「あとでやる」が多く、チップの折り返し行数の見積りが実際のflex-wrapとズレるケースで発生）、測定される高さ自体が`minHeight`で強制的に押し上げられた値になり、それが`measuredH`に記録され、次回以降もその過大な値が「実測値」として優先され続ける自己再生産ループになっていた（見積りが縮んでも二度と縮まらず、カード下部に無駄な空白が残る）。**この種の「見積り→minHeightで反映→その要素自体を測定→見積りにフィードバック」という構成は、見積りが一度でも過大になると実測で下方修正できない構造的な罠になるため、新しく類似の自動調整ロジックを書く時は、必ずminHeightの影響を受けない内側の要素（コンテンツの自然な高さそのもの）を測定対象にすること。** `FreeTimeCard`に`measureRef`propを追加し、`minHeight`を持つ外側のdivではなく中身（アイコン行・時間表示・チップ群）だけを包む内側のdivをResizeObserverの対象にして修正した。

**さらに別の不具合: `measuredH`のキーに日付が入っておらず、日をまたいだ古い実測値を使い回してカードが重なる不具合があった。** `Timeline`は`date`が変わっても再マウントされない（`<Timeline date={date} .../>`に`key`を付けていない設計）ため、`measuredH` stateは日付をまたいでも同じコンポーネントインスタンスに保持され続ける。ここで`data-gk`のキーが`g.startTime`（`"09:30"`のような時刻文字列のみ）や`` `free-${slot.start}` ``（同様）だと、**別の日の同じ時刻に内容の高さが違うタスク・空き時間があった場合、古い日で測定した高さを新しい日のレイアウト計算に誤って使い回してしまう**（例: A日の09:30に短い1行タスクがあり`measuredH["09:30"]`が60pxで記録された後、B日の09:30に長いメモ・サブタスク付きの重いタスクがあると、B日を開いた瞬間は前者の60pxがそのまま使われ、実際のカードは140px近くまで伸びるのに後続の空き時間・就寝カードは60px分の位置にしか配置されず、カード同士が視覚的に重なる）。修正: `Timeline`内に`gkTime(t)=>\`${date}-${t}\``・`gkFree(t)=>\`${date}-free-${t}\``という日付付きキー生成ヘルパーを追加し、`data-gk`の設定・`measuredH`の参照・`freeChromeRef`の参照のすべてをこの2つ経由に統一した（`task.id`はグローバルに一意なのでこの対応は不要）。**タイムラインの測定系に新しいキーを追加する時は、必ず日付を含めること。** 単なる時刻文字列やタスク内の相対的な値だけをキーにすると、`Timeline`が日付間で使い回されるこのコンポーネント構造では同じ不具合が再発する。

**さらに別の不具合: 未測定タスクの高さ見積り(`MIN_CARD_H=60`固定)がサブタスク・メモ付きタスクだと実際の高さより大幅に低く、日付変更でタスクを移動した直後に一瞬（ResizeObserverが実測補正するまでの間）後続カードと重なって見えることがあった。** タスクを別日に移動する（`TaskModal`の日付フィールドを変更する）と、移動先の日付+時刻の組み合わせは`measuredH`に一度も記録されたことのない新規キーになるため、`groupStackH`・`taskGroupList`の`h`計算・アイコンスタックの`cardHeights`はいずれも`MIN_CARD_H=60`にフォールバックする。サブタスクやメモを持つタスクは実際には100px前後まで伸びるため、実測で補正されるまでの間、後続の空き時間カード・次のタスクカードが本来より上に詰めて配置され、視覚的に重なることがあった。修正: `MIN_CARD_H`固定の代わりに`estimateTaskH(t)`（Timeline内）で、タスクが持つ要素（締切ラベル・タグ行・サブタスク or メモのアイコン行）に応じて見積りを底上げするようにした。`calcFreeContentH`（空き時間カードの内容量見積り）と同じ「実測優先・見積りはフォールバック」パターンで、見積り自体の精度を上げることで実測までのズレを縮める狙い。新しくタスクカードの高さ見積りを使う箇所を追加する時は、`MIN_CARD_H`に直接フォールバックせず`estimateTaskH(t)`を使うこと。

### taskGroupList の高さ計算（`g.h`）

```typescript
const h = tasks.length === 1
  ? measuredH[gkTime(startTime)] ?? estimateTaskH(tasks[0])
  : tasks.reduce((sum, t) => sum + Math.max(measuredH[t.id] ?? estimateTaskH(t), 56), 0)
    + (tasks.length - 1) * 16
    + DUP_LABEL_H;  // 重複ラベル分の高さを加算
```

- `DUP_LABEL_H=24` — 同一時刻グループ先頭の「●タスクが重複しています」ラベル用スペース
- `MIN_CARD_H=60`, `WAKE_CARD_H=52`, `SLEEP_CARD_H=52`
- `estimateTaskH(t)` — 未測定タスクの高さ見積り。`MIN_CARD_H`をベースに、締切ラベル(+18)・タグ行(+20)・住所行(+16)・メモ行(+16)・サブタスクのアイコン行(+40)の有無に応じて底上げする。**住所（`address`）を追加した時にこの関数へ加算を追記し忘れていたため、住所付きタスクの見積りが実際より低くなっていた不具合を修正済み。** 新しくTaskCardに常時表示の行（タグ・締切・住所・メモのような）を追加する時は、`estimateTaskH`にも対応する加算を必ず追記すること（忘れても実測後は自動補正されるが、その一瞬・未測定時の重なりや後述のカプセル分割比のズレの原因になる）

**同じ調査で見つかった別の不具合（起床前・就寝後タスクの積み上げが常に`MIN_CARD_H`固定だった）:** `dayItems`の起床〜就寝の本体ループ（Phase 1）は同一時刻の重複タスクグループでも`item.h=g.h`（`taskGroupList`が計算する、アイコンスタック＋`DUP_LABEL_H`込みの正しい合計高さ）を使うが、起床前タスク（Phase 0）・就寝後タスク（Phase 2）の積み上げループだけは`prevBottom=top+(g.tasks.length>1?MIN_CARD_H:g.h)`のように、重複タスクグループの時だけ`g.h`を無視して`MIN_CARD_H=60`に決め打ちしていた。単一タスクなら`g.h`にフォールバックする一方、重複タスクグループ（アイコン連結スタック表示、実際には2タスクで130px超）は常にこの固定60pxで積み上げ計算されるため、後続カードとの重なりは`measuredH`の実測を待っても直らない**恒久的な**不具合だった（この節の他の不具合が「実測されるまでの一瞬」だけ起きるのに対し、これは`measuredH`を一切参照しないコードパスだったため常に発生する）。修正: Phase 0・Phase 2とも`prevBottom=top+g.h`に統一し、Phase 1と同じ値を使うようにした。**タイムラインの積み上げループ（Phase 0/1/2）に手を入れる時は、3つとも同じ`g.h`を参照しているか必ず確認すること。** 一部のフェーズだけ独自の即席計算をすると、この種の「一部の条件でだけ再発する」不具合になりやすい。

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
const cardHeights = g.tasks.map(t => Math.max(measuredH[t.id] ?? estimateTaskH(t), CAPSULE_H));
const cardTops: number[] = []; // 各カードのtop（累積）
const centers = g.tasks.map((_, i) => cardTops[i] + cardHeights[i] / 2);
// 境界は「カード間の実際の隙間の中点」（cardTops[i+1]-GAP/2）を使う
const boundaries = cardTops.slice(1).map(t => t - GAP/2);

// カプセルi は境界間を埋めるよう伸縮（外端のみ borderRadius:28、内側は0）
// 両端（最初・最後のカプセル）はカード中心±CAPSULE_H/2ではなく、カード自体の実際の
// 上端・下端（cardTops[0] / cardTops[n-1]+cardHeights[n-1]）まで伸ばす
const capTops    = cardTops.map((ct, i) => i===0 ? ct : boundaries[i-1]);
const capBottoms = cardTops.map((ct, i) => i===n-1 ? ct+cardHeights[i] : boundaries[i]);
```

**過去の不具合: 2件重複時、カプセルの分割が常にちょうど半々になり、カードの実際の高さ差に追従しなかった。** 境界を「カード中心同士の中点」（`(centers[i]+centers[i+1])/2`）で計算していたが、これは2件ちょうどの場合に数学的に必ず「各カプセルの高さ = (centers[i+1]-centers[i])/2 + CAPSULE_H/2」という同一の式に帰着し、実際のカード高さの比に関係なく常に50/50の分割になってしまう（住所・メモ・タグ等が増えて一方のカードだけ大幅に長くなっても、カプセルはその差を反映しない）。修正: 境界を「カード中心同士の中点」ではなく「カード間の実際の隙間の中点」（`cardTops[i+1]-GAP/2`、位置ベース）に変更し、カプセルの伸縮が実際のカード高さに追従するようにした。**新しくこのカプセル分割ロジックに手を入れる時は、n=2の場合で実際に高さの異なる2枚のカードを使い、分割比が意図通り変わるか必ず確認すること**（中心同士の中点ベースの式は一見自然に見えるが、n=2では常に50/50に帰着するという非自明な罠がある）。

**続けて見つかった別の不具合: 内側の境界を修正した後も、両端（先頭・最後）のカプセルだけは「カード自体の実測高さ」ではなく固定`CAPSULE_H=56`基準（`center±28px`）のままだったため、56pxより実測が大きいカード（サブタスク・メモ・住所等で伸びたカード）では上下に余白が残り、カプセルがカードより短く見える不具合が残っていた。** 修正: 両端のカプセルも中心±CAPSULE_H/2ではなく、カードの実際の上端・下端（`cardTops[0]`／`cardTops[n-1]+cardHeights[n-1]`）まで伸ばすように変更した。内側の境界（`boundaries`）は変更不要（すでに実際のカード間の隙間の中点を指しているため）。**両端カプセルの伸縮ロジックを触る時は、必ず一方のカードが`CAPSULE_H`より大きく伸びるケース（サブタスク・メモ・住所付き等）で、カプセルの上端/下端がそのカードの実際の上端/下端と一致するか確認すること。**

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
const RC_API_KEY = 'appl_zyfcgKyGHORBKcOppeougWslCRP';
const ENTITLEMENT_ID = 'BrainBox Pro';
```

**`GHORB`の`O`は英字のO（ゼロではない）。** 過去に`GH0RB`（ゼロ）と誤記して`Invalid API Key`エラーになった実績があり修正済み（コミット`b8e9dc0`）。このドキュメントの値をコード側の正としてコピー元にすること（逆に、もしこの値を見て「ゼロの方が正しそう」と推測でコード側を書き換えると、この不具合が再発する）。

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
| `priceString` | `string \| null` | App Storeのストアフロントに応じてRevenueCatがローカライズした価格文字列（例:`"$1.99"`）。ネイティブで`getOfferings()`が解決するまでは`null` |

### App Store Connect 設定

| 項目 | 値 |
|---|---|
| 製品ID | `jp.brainbox.app.premium.monthly` |
| サブスクリプショングループ | PROプラン |
| Apple ID | 6787616578 |
| 価格 | ¥200/月 |
| ローカリゼーション（日本語） | 表示名: BrainBox PRO / 説明: PRO機能が使い放題に |

### PRO画面（SettingsScreen 内 `sub==='pro'`）

```tsx
// isPremium=false: 購入UI
<div>{priceString ?? '¥200'}/月カード + "PROプランを始める"ボタン + "購入を復元"リンク</div>
// isPremium=true: 利用中UI
<div>"PROプランを利用中です"カード</div>
```

- `SettingsRow` の PRO 行: `isPremium ? '利用中' : ` `月額${priceString ?? '¥200'}` ``
- `purchase()` / `restore()` / `priceString` は `usePremium()` から取得

**価格表示は固定文字列にしない（重要）:** 当初PRO画面・設定メニューのPRO行はどちらも `¥200`/`月額¥200` を直書きしていたが、App Store Connectで設定する基準価格はストアフロント（国・地域）ごとにAppleが為替レートに応じて自動換算するため、日本以外のユーザーには実際に課金される金額と表示が食い違う不具合だった。`Premium.tsx`の`PremiumProvider`がネイティブ初期化時（`getCustomerInfo()`と同じ`useEffect`内）に`Purchases.getOfferings()`を呼び、`offerings.current?.monthly?.product.priceString`（RevenueCatがApp Storeのロケールに応じてフォーマット済みの価格文字列、例: `"$1.99"`）を`priceString`としてContextで公開するよう修正した。呼び出し側（PRO画面・設定メニューのPRO行）は`priceString ?? '¥200'`で、取得できるまでの一瞬だけ日本円の値をフォールバック表示する（ブラウザ・開発環境は`isPremium`が常に`true`のためこの購入UI自体が表示されず、実質ネイティブの未購入状態でのみ関係する）。

### 避けるパターン

- `Premium.tsx` の `isPremium` をブラウザ環境以外でハードコード `true` に戻さない
- `@revenuecat/purchases-capacitor` を **static import** しない（ビルドエラー）。ただし **dynamic import に `webpackIgnore: true` は付けない**（実機で購入が失敗する実際のバグの原因になった）
- v13 の `getOfferings()` を `{ offerings }` で分割代入しない

### Google Play クローズドテスト用の強制PRO化（Android限定、`FORCE_PREMIUM_ANDROID`）

Google Playのクローズドテストでテスターに課金リスクなくPRO機能を使ってもらうための仕組み。ライセンステスター（Googleアカウント個別登録・実購入フローを通すが課金はされない方式）ではなく、**購入フロー自体を呼ばず端末上で強制的に`isPremium=true`にする**方式を採用した（登録漏れによる誤課金が原理的に起きないため）。

- `Premium.tsx`の`FORCE_PREMIUM_ANDROID`定数（`process.env.NEXT_PUBLIC_FORCE_PREMIUM_ANDROID==='true'`）が立っている時だけ、ネイティブ判定後にRevenueCatへ一切触れず`isPremium`をtrue固定する（`purchase()`も早期returnする）
- **iOSには絶対に波及させない。** ビルド時の環境変数だけに頼らず、`isAndroidNative()`（`Capacitor.getPlatform()==='android'`）を実行時にも必ず併せてチェックする二重ガードにしてある（iOS用ビルドにこの環境変数が紛れ込む・同じビルド成果物を誤ってiOS側にも同期してしまう、といった人為ミスが起きてもiOS側では絶対に発動しないようにするための保険）
- 普段の`./build-android.sh`（環境変数無し）はこれまで通り実購入フローのまま。クローズドテスト用ビルドの時だけ`NEXT_PUBLIC_FORCE_PREMIUM_ANDROID=true ./build-android.sh`のように明示的に付けてビルドする。**この環境変数は`.env.local`等に永続化せず、クローズドテスト用ビルドのたびに手動で付ける**（本番ビルドへの付け忘れによる事故より、通常ビルドへの付け忘れ＝デフォルトで通常の課金フローに戻る方が安全なため、あえて永続化しない設計）
- クローズドテストを終了する時は、何もしない（この環境変数を付けずに本番用AABをビルドし直すだけで自然に通常の課金フローに戻る）

**避けるパターン:**
- `FORCE_PREMIUM_ANDROID`の判定からプラットフォームチェック（`isAndroidNative()`）を外さない（環境変数だけの判定にすると、ビルド成果物の取り違え等でiOSに波及するリスクが生まれる）
- `NEXT_PUBLIC_FORCE_PREMIUM_ANDROID`を`.env.local`やVercelの環境変数に恒久的に設定しない（Web/開発環境は元々`isPremium`が常にtrueなので無意味な上、Androidの通常ビルド時に誤って有効なままになるリスクを増やすだけ）
- この仕組みを開発者モード（`DevMode.ts`）の`DEV_PREMIUM_OVERRIDE_KEY`と混同・統合しない（開発者モードは今後もアプリバージョン7回タップで解放する自分専用の検証ツールとして維持する方針。クローズドテスターにはその存在を一切教えない）

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
- **発火予定時刻が就寝時間帯に重なる場合、起床時刻ちょうどに前倒しするのではなく、起床時刻を起点として改めて`laterReminderHours`時間分カウントし直す**（就寝中はカウントが止まるイメージ。アプリ放置アラートと共通の`adjustFireForSleep(fireMs, hours, wakeTime, sleepTime)`を使う）。単純に起床時刻ちょうどに前倒しすると、①起床直後に間髪入れず通知が来てしまう、②朝イチの起床チェックイン通知（`syncWakeCheckins`）と同時刻に重なって「朝に複数の通知が届く」体験になる、の2つの問題があったため、起床時刻＋設定時間だけずらす設計に変更した。`hours`が起床〜就寝の間隔より長い設定だと、加算後もまだ就寝時間帯に重なることがあり、その場合は起床時刻そのものにフォールバックする（`adjustFireForSleep`内で対応済み）
- **同じタスクの再通知（`STALE_REPEAT_HOURS`＝6時間おき）が2回とも同じ就寝時間帯に重なると、どちらも同じ調整後の時刻に後ろ倒しされて全く同じ内容の通知が同時刻に重複する不具合があった。** タスクごとのループ内で直前の（調整後の）発火時刻を記録し、今回の発火時刻がそれと同じならスキップして重複登録しないよう修正済み。就寝時間帯が長い設定だとこの重複が起きやすいため、`adjustFireForSleep()`を絡めた繰り返し通知を新しく追加する時は同じ重複チェックが必要かどうか確認すること
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
- `deadlineRemainLabel(deadlineAt)` がタイムライン・あとでやるリストでの表示用ラベル（「締切まであと14日」「締切から3日超過」）を計算する。日数は時刻を無視しカレンダー日数だけで計算するが、**当日（diff===0）だけは締切の時刻まで含めて「締切は本日の13時」のように表示する**（分が0でなければ「13時30分」のように分も表示）
- `src/app/components/LocalNotify.ts` の `syncDeadlineAlerts(alerts)` — ネイティブでのみ動作
- `src/app/page.tsx` の App コンポーネントに、`tasks` が変わるたびに未完了かつ`deadlineAt`/`deadlineNotify`があるタスクの未来のfireをすべて計算し、直近60件を`syncDeadlineAlerts()`に渡す `useEffect` がある。識別子は `deadline-${taskId}-${fireKey}`（`fireKey`は`week`/`3days`/`dayBefore`/`sameDay`/`5h`/`3h`/`1h`/`exact`）
- `LocalNotifyPlugin.swift` は他の通知と共通の `scheduleAlerts(prefix:call:)` を使い、`deadline-` prefixで全解除→再登録する
- Web/開発環境専用フォールバック（`now`ポーリング＋即時`notify()`、`DEADLINE_ALERT_FIRED_KEY`使用）も用意しており、ネイティブでは`isNative()`で早期returnする
- 表示: `TaskCard`とBottomTabsの「あとでやる」リスト行に、締切がある場合は🚩アイコン付きで`deadlineRemainLabel()`のラベルを表示する。色は`deadlineLabelColor()`が3段階で判定する（超過・当日=`#D97A7A`、直近1〜3日=`text-amber-600`、それ以外=グレー）。常に赤にすると余裕がある締切まで目立ってしまい緊急度のシグナルにならないため、あえて3段階にしている
- PRO比較表（設定 → PRO）に「締切管理」の行を追加済み

### Xcodeでの手動セットアップ（`ios/`はgitignore対象なので毎回必要）

1. `native-ios/LocalNotifyPlugin.swift` / `.m` を `ios/App/App/` に追加（Target Membership: App）
2. `native-ios/BridgeViewController.swift` の `capacitorDidLoad()` に `bridge?.registerPluginInstance(LocalNotifyPlugin())` があることを確認（無ければ追記。既存の `ios/App/App/BridgeViewController.swift` は `git pull` で自動反映されないので **Xcode上で直接編集**）
3. App Group・Info.plist・Background Modesの追加設定は不要（通知権限のリクエストはコード内で完結し、Info.plistの usage description キーも通知には不要）
4. **`LocalNotifyPlugin.swift`/`.m` を編集した場合、`ios/App/App/` 内の既存ファイルは `git pull` しても自動更新されない**（`ios/` はgitignore対象で、Xcodeに追加した時点でプロジェクト内に物理コピーが作られているため）。`native-ios/` の最新内容を都度 Xcode上のファイルにコピーし直す（既存ファイルを削除して `native-ios/` から追加し直すのが確実）

### Android実装（`native-android/`、Capacitorプラグイン名を揃えて無改修で共用）

`src/app/components/LocalNotify.ts` は `registerPlugin<LocalNotifyPluginType>('LocalNotifyPlugin')` で名前だけを頼りにプラグインを呼んでおり、Android側も同じ `name = "LocalNotifyPlugin"` で実装したため、**JS側は一切変更不要**（iOS/Android/Web の3プラットフォームとも同じ`LocalNotify.ts`がそのまま動く）。

- `native-android/BrainBoxNotifications.kt` — 通知チャンネル作成・実際の通知表示ロジック（`LocalNotifyPlugin`と`LocalNotifyReceiver`の両方から呼ばれる共通処理）
- `native-android/LocalNotifyPlugin.kt` — Capacitorプラグイン本体。`notify`/`requestPermission`/`syncTaskAlerts`等、iOS版と同じメソッド名・引数（`alertsJson`）を実装
- `native-android/LocalNotifyReceiver.kt` — `AlarmManager`で予約したアラームが発火した時にOSから呼ばれる`BroadcastReceiver`
- `native-android/BootReceiver.kt` — **iOS版には無い、Android特有の対応。** `AlarmManager`の予約は端末の再起動で全て消えるため、再起動時に`SharedPreferences`（`LocalNotifyPlugin.PREFS_NAME`）へ保存しておいた各カテゴリのアラート一覧から、まだ未来の時刻のものだけを再予約する

**iOSの`getPendingNotificationRequests`に相当するAPIがAndroidの`AlarmManager`には無い。** そのため「同じprefixの予約を全解除してから再登録する」という`syncTaskAlerts`等の全解除→再登録方式を実現するために、`SharedPreferences`に**prefixごとの全アラートJSONをそのまま保存**して自前管理している（`cancelStored()`が保存済みJSONから`id`を復元し、同じ`id.hashCode()`を`requestCode`にした`PendingIntent`を`cancel()`する）。新しく同種のプラグインをAndroidに移植する時、iOSのAPIが「登録済み一覧を取得できる」設計に依存している場合は、同じようにSharedPreferences等での自前ブックキーピングが必要にならないか確認すること。

**通知タップ時のディープリンク（買い物リストを開く等）は今回未対応。** iOS版は`GeofencePlugin`が`UNUserNotificationCenterDelegate`を1つだけ持ち、全通知カテゴリのタップ処理をそこに集約している。Android版もGeofencePlugin移植時に同じ設計（タップ時にSharedPreferencesへ`pendingOpenShopList`的なフラグを立て、JS側がアプリ再開時に読む）で揃える予定。現時点では通知をタップするとアプリが開くだけ。

### Android Studioでの手動セットアップ（`android/`はgitignore対象なので毎回必要）

1. `native-android/BrainBoxNotifications.kt` / `LocalNotifyPlugin.kt` / `LocalNotifyReceiver.kt` / `BootReceiver.kt` を `android/app/src/main/java/jp/brainbox/app/` にコピー（Finderからドラッグ＆ドロップでOK。Xcodeの「Target Membership」チェックに相当する作業はAndroidには無い）
2. `native-android/MainActivity.java` の内容で `android/app/src/main/java/jp/brainbox/app/MainActivity.java` を上書きする（`registerPlugin(LocalNotifyPlugin.class)` の行が無いとプラグインが認識されない。iOSの `BridgeViewController.capacitorDidLoad()` でのプラグイン登録と同じ役割）
3. `native-android/LocalNotifyManifest.snippet.xml` の内容を `android/app/src/main/AndroidManifest.xml` に追加（`<uses-permission>` 3行は `<manifest>` 直下、`<receiver>` 2つは `<application>` タグの内側）
4. **`android/build.gradle`・`android/app/build.gradle`にKotlinプラグインを追加する（重要・初回は入っていない）。** `npx cap add android`が生成する既定のテンプレートはJavaのみを前提にしており、Kotlinプラグイン（`kotlin-android`）・Kotlin Gradleプラグインのclasspathが一切無い。この状態で`.kt`ファイル（`LocalNotifyPlugin.kt`等）を追加しても**Kotlinコンパイラ自体が呼ばれないため何のエラーも出ないままコンパイルされず**、`MainActivity.java`から`registerPlugin(LocalNotifyPlugin.class)`を呼ぶ行だけが「シンボルを見つけられません」でビルド失敗する（実際に発生した不具合）。
   - `android/build.gradle`の`buildscript.dependencies`に`classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.24'`を追加
   - `android/app/build.gradle`の`apply plugin: 'com.android.application'`の直後に`apply plugin: 'kotlin-android'`を追加
   - `android/app/build.gradle`の`dependencies`に`implementation "org.jetbrains.kotlin:kotlin-stdlib:1.9.24"`を追加
   - 追加後はAndroid Studioで「Sync Now」してから再ビルドする
5. Android Studioで一度Gradle同期・ビルドが通ることを確認する
6. **これらのファイルを編集した場合、`android/` 内の既存ファイルは `git pull` しても自動更新されない**（`android/` はgitignore対象で、`npx cap add android`実行時にプロジェクト内へ物理コピーが作られているため）。`native-android/` の最新内容を都度 `android/app/src/main/java/jp/brainbox/app/` にコピーし直すこと

### 避けるパターン

- `new Notification(...)` を直接呼ばない（WKWebViewでは動かない。必ず `notify()` 経由にする）
- 新しい通知処理を追加するときに、既存の `useEffect` 群（フォアグラウンドの `now` ポーリング）だけで済むと思い込まない。バックグラウンド/未起動でも発火が必要なら、必ずネイティブスケジューリング方式（Geofence/Inactivity/タスクアラートと同じ設計）を検討する
- Android側で新しい通知系プラグインを追加する時、`AlarmManager`の予約が端末再起動で消えることを忘れて`BootReceiver`での再予約を省略しない（`LocalNotifyPlugin`と同じパターンで、SharedPreferencesに全アラートJSONを保存し起動時に読み直す設計に倣うこと）
- Capacitorプラグイン名（`@CapacitorPlugin(name = "...")`）をiOS側の`@objc(...)`と違う名前にしない。同じ名前で揃えることでJS側（`registerPlugin`）が完全に無改修でプラットフォーム間共有できる
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

### Android実装（`native-android/AppIconPlugin.kt`、`<activity-alias>`方式）

**iOSとは実現方法が根本的に異なる。** iOSは`UIApplication.setAlternateIconName()`という1つのAPI呼び出しだけで切り替えられるが、Androidには相当するAPIが無い。代わりに、色の数だけ`AndroidManifest.xml`に`<activity-alias>`（`MainActivity`を指す「別名」コンポーネント。それぞれ別の`android:icon`を持てる）を事前宣言しておき、`PackageManager.setComponentEnabledSetting()`でどのエイリアス（または`MainActivity`本体）を有効にするかを切り替える方式を取る。ホーム画面には、有効化されている・かつLAUNCHERの`intent-filter`を持つコンポーネントのアイコンが表示される。

- `native-android/AppIconPlugin.kt` — `setAppIcon(name)`。`"mint"`（デフォルト）なら`MainActivity`本体を有効化・全エイリアスを無効化、それ以外の8色（`sage`/`lilac`/`rose`/`dusty`/`apricot`/`greige`/`charcoal`/`mocha`）なら対応するエイリアス1つだけを有効化し`MainActivity`本体と他のエイリアスを無効化する。**`PackageManager.DONT_KILL_APP`フラグを必ず指定すること**（指定しないとコンポーネント無効化のたびにアプリのプロセスが強制終了される）
- `native-android/AppIconManifest.snippet.xml` — 8色ぶんの`<activity-alias>`宣言。`android:name`（`.MainActivityAliasSage`等）は`AppIconPlugin.kt`の`ALIAS_SUFFIXES`マップのキー・クラス名と完全に一致させること（ズレると`PackageManager`が例外を投げる）。全エイリアスは`android:enabled="false"`で開始する（デフォルトは`MainActivity`本体=mint）。Android 12+ではLAUNCHERの`intent-filter`を持つコンポーネントに`android:exported="true"`が必須

**アイコン画像アセット自体は手動作業が必要（コード変更だけでは完結しない）。** `<activity-alias>`の`android:icon`/`android:roundIcon`が参照する`ic_launcher_sage`等のmipmapリソースは、Android Studioの Image Asset ウィザード（File → New → Image Asset）で色ごとに1回ずつ生成する。ソース画像は`public/app-icons/{sage,lilac,rose,dusty,apricot,greige,charcoal,mocha}.png`（アプリ内アイコン選択画面のプレビューにも使っている同じ1024px角の画像。`mint`はデフォルトの`ic_launcher`が既にあるため対象外）を使う。生成した`Icon name`を`ic_launcher_<色名>`にすること（マニフェストの参照名と一致させる必要がある）。

### Android Studioでの手動セットアップ（`android/`はgitignore対象なので毎回必要）

1. `native-android/AppIconPlugin.kt`を`android/app/src/main/java/jp/brainbox/app/`にコピー
2. `native-android/MainActivity.java`の内容で既存の`MainActivity.java`を上書きする（`registerPlugin(AppIconPlugin.class)`の行が追加されている）
3. `native-android/AppIconManifest.snippet.xml`の内容を`android/app/src/main/AndroidManifest.xml`の`<application>`タグ内、既存の`<activity android:name=".MainActivity">`の直後に追加する
4. 上記の「アイコン画像アセット」節の手順で、8色ぶんの`ic_launcher_<色名>`/`ic_launcher_<色名>_round`mipmapリソースをImage Assetウィザードで生成する
5. Android Studioで「Sync Now」→ビルドが通ることを確認する
6. 実機/エミュレータで設定 → PRO → アプリアイコンから色を選び、ホーム画面のアイコンが切り替わることを確認する（エミュレータではランチャーによっては即座に反映されず、ホーム画面から一度アプリドロワーを開き直す必要がある場合がある）
7. これらのファイルを編集した場合、`android/`内の既存ファイルは`git pull`しても自動更新されない（`native-android/`の最新内容を都度コピーし直すこと。他プラグインの節と同じ注意事項）

### 避けるパターン（Android）

- `<activity-alias>`の`android:name`と`AppIconPlugin.kt`の`ALIAS_SUFFIXES`のキー・クラス名をズラさない（`PackageManager.setComponentEnabledSetting()`が対象コンポーネントを解決できず例外になる）
- `PackageManager.setComponentEnabledSetting()`に`PackageManager.DONT_KILL_APP`フラグを付け忘れない（付けないとコンポーネント切り替えのたびにアプリプロセスが強制終了される）
- `MainActivity`本体と複数のエイリアスを同時に有効化しない（ホーム画面に同じアプリのアイコンが複数表示されてしまう。常に「有効なのは1つだけ」を保つこと）
- Image Assetウィザードで生成する`Icon name`をマニフェストの参照名（`ic_launcher_<色名>`）とズラさない

---

## ホーム画面ウィジェット（次の予定 & 買い物リスト・2カラム統合）

iOS標準のホーム画面ウィジェット（WidgetKit）。1つの大きいウィジェット（systemLarge）の中で左カラムに「次の予定」（最大4件、時刻付き）、右カラムに「買い物リスト」（最大6件）を表示する。**iOS 17+のインタラクティブウィジェット機能を使い、各行をタップするとその場でタスク完了／購入済みにできる。**

### データの流れ（アプリ → ウィジェット）

1. `src/app/page.tsx` の App コンポーネントに、`tasks`/`shopItems`/`now`/`settings.theme`/`language` が変わるたびに次の予定4件・未購入アイテム6件・現在のテーマカラー・現在の言語設定を計算して `updateWidgetData()` を呼ぶ `useEffect` がある（各アイテムに `id` を含める。後述のタップ完了機能で必須）
2. `src/app/components/WidgetData.ts` — `updateWidgetData(tasks, shopItems, laterItems, themeColor, language)` がCapacitorカスタムプラグイン `WidgetDataPlugin` を呼ぶ（Web/開発環境では何もしない）。`language`はウィジェット自体の表示には使わない（String Catalogでデバイス言語に自動追従するため）が、`GeofencePlugin`が場所通知の文言を組み立てる時に使う（後述）
3. `native-ios/WidgetDataPlugin.swift` / `.m` — JSON文字列とテーマカラー(hex文字列)・言語コード(`"ja"`/`"en"`)をApp Group共有の `UserDefaults(suiteName: "group.jp.brainbox.app")` に書き込み、`WidgetCenter.shared.reloadAllTimelines()` でウィジェットを更新する
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
7. `native-ios/Widgets/Localizable.xcstrings`（String Catalog、ウィジェットの英語対応用）も同じ **Widget Extension ターゲット**に追加

**⑤ ウィジェットの英語対応（String Catalog）**

ウィジェット内の固定文言（「次の予定」「買い物リスト」等のラベル・ウィジェットギャラリーの説明文・インタラクティブ操作の名前）は `native-ios/Widgets/Localizable.xcstrings`（Xcode 15+ の String Catalog、ja基準+en訳を1ファイルにまとめたもの）で英語対応している。SwiftUIの`Text(_:)`は**リテラル文字列を直接渡した場合のみ**`LocalizedStringKey`として自動的にこのカタログを検索する（`Text("次の予定")`はOK、`Text(someStringVariable)`のように一度`String`型の変数を経由すると非ローカライズ版の`Text<S:StringProtocol>`に解決されてしまい、カタログを追加しても翻訳されない）。`QuadWidgetView.quadColumn(title:)`のtitle引数を`String`ではなく`LocalizedStringKey`型にしているのはこのため——新しく共通化した見出しコンポーネントを作る時も同じ罠に注意すること。

- `.configurationDisplayName(_:)` / `.description(_:)`（ウィジェットギャラリーでの表示名・説明文）は`LocalizedStringResource`型を受け取るAPIなので、文字列リテラルをそのまま渡せば同じカタログから自動的に引かれる
- `WidgetIntents.swift`の`static var title: LocalizedStringResource = "タスクを完了"`も同様にカタログから自動で引かれる
- `WidgetTaskItem.name`/`WidgetShopItem.name`/`WidgetLaterItem.name`（実際のタスク名・買い物名）は元々ユーザーが入力した文字列そのものであり、カタログの対象外（翻訳しようがないので対象にしない）
- Widget Extensionターゲットの「Info」→「Localizations」に English が追加されていることを確認する（String Catalogをターゲットに追加すると自動で候補に出るはずだが、出ない場合はプロジェクト設定の Localizations で手動追加）
- **実機で確認する時は端末の言語をEnglishに切り替えて**、ホーム画面からウィジェットを一度削除→再追加するのが確実（キャッシュされたタイムラインが残っていると言語が反映されないことがある）

**④ ビルド・実機確認**

1. メインの `App` スキームのままビルド・実行（Widget Extensionは自動的に埋め込まれる）
2. 実機のホーム画面で長押し →「ウィジェットを追加」→「BrainBox」を検索 →「次の予定 & 買い物リスト」（systemLarge）を追加
3. 行をタップ →その場でウィジェットから消える→ アプリを開くと実際に完了/購入済みになっていることを確認

### ロック画面ウィジェット（`AddLaterVoiceLockScreenWidget`、`.accessoryCircular`）

iOS 16+のロック画面ウィジェット（丸いバッジ型）。ホーム画面の「音声でタスク追加」ウィジェット（`AddLaterVoiceWidget`）と全く同じ`brainbox://addLaterVoice`URLスキームを使うだけなので、新しいCapacitorプラグインやデータ連携は不要——`BrainBoxWidgets.swift`に`StaticConfiguration`をもう1つ追加しただけ（Widget Extensionターゲットの既存ファイルを更新するだけで、新規ターゲット作成は不要）。

- `AddLaterVoiceLockScreenView`／`AddLaterVoiceLockScreenWidget`（`BrainBoxWidgets.swift`） — マイクアイコン＋「BB」の2文字（`VStack`で縦に並べる）という最小構成。`.accessoryCircular`の枠は直径50px前後と非常に小さく「BrainBox」のフルスペルは入らないため、「BB」の2文字に短縮した。`AccessoryWidgetBackground()`（WidgetKitがロック画面ウィジェット用に提供するシステム標準の半透明円背景）を使い、アイコン・文字をまとめて`.widgetAccentable()`でアクセント対象としてマークする
- **`AccessoryWidgetBackground()`は`.containerBackground`のクロージャ側ではなく、実際に描画される`body`側のZStackに含めること（重要）。** 一度`.containerBackground(for: .widget){ AccessoryWidgetBackground() }`の形にしたところ、「Please adopt containerBackground API」エラーは直ったが、今度は半透明の丸い背景自体が表示されず（他の標準ウィジェットに見られる円形の縁取りが無く）アイコン・文字が壁紙の上に浮いた状態になる不具合が実機で発覚した。修正: `body`側の`ZStack{ AccessoryWidgetBackground(); アイコン・文字 }`で実際の見た目を描画し、`.containerBackground(for: .widget){ Color.clear }`はiOS 17+の必須API要件を満たすためだけに空の透明色を指定する、という二段構成にした。新しいaccessory系ウィジェットを作る時は、containerBackgroundは「必須APIを満たすための空の指定」、`AccessoryWidgetBackground()`は「実際に見た目を作るための描画内容」と役割を分けて考えること。
- **ロック画面ウィジェットは常にシステムがモノクロ/ユーザー選択のアクセントカラーでレンダリングする**（ホーム画面ウィジェットのようにテーマカラーをそのまま使ったフルカラー表示にはならない）。`.widgetAccentable()`を付けた要素だけがユーザーのアクセントカラーに追従する対象になる——`entry.themeColor`をこのビューで使っていないのはこのため（渡しても意味を持たない）
- `supportedFamilies([.accessoryCircular])`のみ指定（`.accessoryRectangular`/`.accessoryInline`は今回未対応）
- `BrainBoxWidgetBundle`に追加するだけで、ホーム画面ウィジェットと同じギャラリーに並ぶ（ユーザーがロック画面編集時に選ぶとロック画面専用のウィジェットとして候補に出る。Xcode側の追加セットアップ手順は無い——既存のWidget Extensionターゲットの`BrainBoxWidgets.swift`を最新内容に差し替えるだけでよい）

**過去の不具合（実機で発覚）: `.containerBackground(for: .widget)`の指定漏れで、ロック画面に追加してもグレーの丸に「！」＋「Please...」のエラー表示のまま、タップしてもアプリが開くだけで音声入力画面にならなかった。** `CombinedWidgetView`/`QuadWidgetView`/`AddLaterWidgetView`/`AddLaterVoiceWidgetView`はいずれも`.containerBackground(adaptiveWidgetBackground, for: .widget)`を付けているのに、`AddLaterVoiceLockScreenView`だけ`body`の中に直接`AccessoryWidgetBackground()`を置いていて、このcontainerBackground指定が抜けていた。**iOS 17+では、ロック画面・文字盤コンプリケーションを含む全ウィジェットファミリーで`.containerBackground(for: .widget)`の指定が必須**——無いとWidgetKitがレンダリングを拒否し、「Please adopt containerBackground API」というシステムのエラープレースホルダー（グレーの丸に「！」＋「Please...」の切れた表示）になる。同じ原因による不具合はビルド番号・バージョン不一致の警告とは別物で、Xcodeの警告一覧には出てこない（コンパイルは普通に通る）ため気づきにくい。ホーム画面側のウィジェットが同じBuild/Versionで正常に動いていたのに、ロック画面側だけ症状が出ていたのもこれが原因（`.accessoryCircular`ファミリー固有の実装だけがこの指定を欠いていたため）。修正: `AccessoryWidgetBackground()`を`.containerBackground(for: .widget){ }`のクロージャ側に移し、`body`にはタップ対象のアイコン（`Image(systemName:...)`）だけを残した。**新しいaccessory系ウィジェット（ロック画面・文字盤コンプリケーション）を追加する時は、`AccessoryWidgetBackground()`を`body`に直接置かず、必ず`.containerBackground(for: .widget){ AccessoryWidgetBackground() }`の形にすること。** この不具合の調査では、アプリを完全削除してもロック画面に置いたままのウィジェットインスタンスがエラー表示のまま残り続けるというiOS側のキャッシュ挙動も確認された（ホーム画面ウィジェットはアプリ削除で自動的に消えるのに対し、ロック画面は消えないことがある）——この種の不具合を調査する時は、壊れたウィジェットインスタンス自体をロック画面の編集画面から手動で削除してから再インストール・再追加する必要がある。

**さらに別の不具合（実機で発覚・最も根本的だった原因）: 見た目の修正を繰り返すうちに、`AddLaterVoiceLockScreenView`/`AddLaterVoiceLockScreenWidget`の構造体自体が`BrainBoxWidgetBundle`の`body`から（あるいはファイルから丸ごと）失われ、ウィジェットが「ウィジェットを追加」の一覧に全く出てこなくなっていた。** `Minimum Deployments`（App 15.0 / BrainBoxWidgetsExtension 26.5という不一致、デバイスは26.6.2だったため実際には関係なかった）を揃えても症状は直らず、最終的に`BrainBoxWidgetBundle`の`var body`を確認したところ`AddLaterVoiceLockScreenWidget()`の行自体が無かった（Find-in-fileでファイル全体を検索しても`AddLaterVoiceLockScreenView`/`AddLaterVoiceLockScreenWidget`が1件もヒットしなかった）。Xcode上でFind-in-fileのスニペット差し替えを何度も繰り返す修正の途中で、意図せず該当ブロックごと消えてしまったと考えられる。**「ウィジェットが一覧に出てこない」「置いても一瞬で消える」系の不具合を調査する時は、Build/Version・Minimum Deployments・containerBackgroundのような設定系の原因を疑う前に、まず対象のWidget構造体が実際に`BrainBoxWidgetBundle`の`body`に登録されているか（Find-in-fileで構造体名を検索して0件でないか）を確認すること。** 見た目の調整のたびにファイル全体を何度も差し替えていると、こうした「ある時から構造体ごと消えている」事故が起きうる。

### Android実装（`native-android/WidgetDataPlugin.kt`・`BrainBoxWidgetProvider.kt`等）

**iOSのWidgetKitとは根本的に仕組みが異なる。** SwiftUI + TimelineProviderで宣言的に描画するiOSに対し、Androidは`AppWidgetProvider` + `RemoteViews`（あらかじめ用意した固定レイアウトの一部だけをリモートから書き換える方式）で実装する。タスク最大4件・買い物最大6件という表示件数の上限がすでに決まっているため、可変長リスト用の`RemoteViewsService`（実装コストが高い）は使わず、レイアウトXMLに固定で用意した`task_row_0..3`/`shop_row_0..5`の表示/非表示を切り替えるだけで足りる設計にした。

**App Group相当の設定が丸ごと不要（iOSより単純な点）。** AndroidのAppWidgetProviderはデフォルトでメインアプリと同じプロセス内で動作するため、普通の`SharedPreferences`（`WidgetDataPlugin.PREFS_NAME="widget_prefs"`）をアプリ本体・ウィジェットの両方からそのまま読み書きできる。iOSのようなApp Group Capability・Widget Extensionターゲットの追加は一切不要。

- `native-android/WidgetDataPlugin.kt` — Capacitorプラグイン本体。`updateWidgetData()`が`widget_prefs`にJSON文字列・テーマカラー・`appLanguage`を書き込み、`BrainBoxWidgetProvider.updateAll(context)`を呼んで配置済みの全ウィジェットを即時再描画する。`getPendingWidgetActions()`はpending配列を読み取って返し、読み取り後に削除する（iOS版と同じ引数・返り値の形）
- `native-android/BrainBoxWidgetProvider.kt` — 「次の予定 & 買い物リスト」本体（`AppWidgetProvider`）。**タップ完了機能はiOS 17+のAppIntentに相当するAPIが無いため、行ごとに異なる`PendingIntent`（本Provider自身へのブロードキャスト、`requestCode`と`putExtra`でidを区別）を`setOnClickPendingIntent()`で割り当てる方式にした。** `onReceive()`でタップされたidを`pendingCompletedTaskIds`/`pendingPurchasedShopItemIds`に追記し`updateAll()`で即座に再描画する（＝ウィジェット上でだけ楽観的に消える、iOS版の`CompleteTaskIntent`/`PurchaseShopItemIntent`と同じ設計）
- `native-android/AddLaterWidgetProvider.kt` / `AddLaterVoiceWidgetProvider.kt` — iOS版の`AddLaterWidget`/`AddLaterVoiceWidget`（systemSmall、ワンタップで追加画面を開くだけの小さいウィジェット）に相当。**新しいCapacitorプラグインやpendingフラグを増やさず、iOS版と同じ`brainbox://addLater`/`brainbox://addLaterVoice`というURLスキームでMainActivityを起動するだけ**（Capacitorの標準的なディープリンク処理にそのまま乗るため、JS側の`appUrlOpen`リスナーは無改修で動く）。この方式を使うにはAndroidManifestの`.MainActivity`に`brainbox://`スキームの`intent-filter`を追加する必要がある（`WidgetManifest.snippet.xml`参照）
- `native-android/res/layout/*.xml`・`res/xml/*_info.xml`・`res/drawable/*.xml` — RemoteViewsのレイアウト・`AppWidgetProviderInfo`（最小サイズ・更新間隔等）・テーマカラーで着色するための単色ドット/背景の図形リソース。**ドットのアイコンは`ImageView.setColorFilter()`でテーマカラーに動的着色するため、XML側の色（白）はダミーでよい**
- `updatePeriodMillis="900000"`（15分）はiOS版の`Timeline(entries:policy:.after(Date()+15分))`に相当する保険的な定期更新（実際のデータ反映は`WidgetDataPlugin.updateWidgetData()`呼び出し時・タップ時に即座に行われるため、この間隔はあくまでフォールバック）

**多言語対応はja/en/ko/zh-TW/es/pt/vi/th/idの9言語すべて対応済み（iOS版と同じ言語カバレッジ）。** `WidgetStrings.snippet.xml`に日本語（デフォルト）・英語に加えて残り7言語ぶんの文言（iOS版`native-ios/Widgets/Localizable.xcstrings`の翻訳を転用）もコメントブロックとして追記済み。**新しいセッションでAndroid Studioにセットアップする時は、この`WidgetStrings.snippet.xml`の日本語ブロックに加えて、残り8言語ぶんのコメントブロックもそれぞれ`values-en/`・`values-ko/`・`values-zh-rTW/`・`values-es/`・`values-pt/`・`values-vi/`・`values-th/`・`values-in/`（Androidのインドネシア語リソース修飾子は歴史的経緯で`in`、`id`ではない点に注意）にコピーすること。**

**言語判定（`GeofenceReceiver.kt`の`appLang()`）はWidgetDataPluginの移植により、iOS版と同じ方式に揃えた。** `widget_prefs`の`appLanguage`キー（`WidgetDataPlugin.updateWidgetData()`が書き込む、アプリ内で手動選択した言語）を優先して読み、JSが一度も`updateWidgetData()`を呼んでいない場合のみ端末のシステムロケールにフォールバックする（買い物リストの場所通知セクションを参照）。

### Android Studioでの手動セットアップ（`android/`はgitignore対象なので毎回必要）

1. `native-android/WidgetDataPlugin.kt`・`BrainBoxWidgetProvider.kt`・`AddLaterWidgetProvider.kt`・`AddLaterVoiceWidgetProvider.kt`を`android/app/src/main/java/jp/brainbox/app/`にコピー
2. `native-android/MainActivity.java`の内容で既存の`MainActivity.java`を上書きする（`registerPlugin(WidgetDataPlugin.class)`の行が追加されている）
3. `native-android/res/layout/`の3ファイル（`widget_combined.xml`/`widget_add_later.xml`/`widget_add_later_voice.xml`）を`android/app/src/main/res/layout/`にコピー
4. `native-android/res/xml/`の3ファイル（`widget_combined_info.xml`/`widget_add_later_info.xml`/`widget_add_later_voice_info.xml`）を`android/app/src/main/res/xml/`にコピー（`xml/`ディレクトリが無い場合は新規作成）
5. `native-android/res/drawable/`の2ファイル（`widget_dot.xml`/`widget_background.xml`）を`android/app/src/main/res/drawable/`にコピー
6. `native-android/WidgetStrings.snippet.xml`のデフォルト（日本語）分を`android/app/src/main/res/values/strings.xml`に、コメントアウトされている残り8言語分（en/ko/zh-rTW/es/pt/vi/th/in）をそれぞれ対応する`values-XX/strings.xml`に追加（ディレクトリが無い場合は新規作成）
7. `native-android/WidgetManifest.snippet.xml`の内容を`android/app/src/main/AndroidManifest.xml`に追加（3つの`<receiver>`は`<application>`タグの内側、`brainbox://`の`intent-filter`は既存の`.MainActivity`の`<activity>`タグの中、既存のLAUNCHER `intent-filter`のすぐ後に追加）
8. Android Studioで「Sync Now」→ビルドが通ることを確認する
9. 実機/エミュレータのホーム画面で長押し →「ウィジェット」→「BrainBox」を検索 → 3種類のウィジェット（「次の予定 & 買い物リスト」「あとでやる」「音声で追加」）が追加できることを確認する
10. 「次の予定 & 買い物リスト」ウィジェットの行をタップ →その場でウィジェットから消える→ アプリを開くと実際に完了/購入済みになっていることを確認する
11. これらのファイルを編集した場合、`android/`内の既存ファイルは`git pull`しても自動更新されない（`native-android/`の最新内容を都度コピーし直すこと。他プラグインの節と同じ注意事項）

### 避けるパターン

- `WidgetDataPlugin` を Widget Extension ターゲットに追加しない（メインAppターゲットのみ。データを書き込む側と読み取る側が逆）
- `BrainBoxWidgets.swift` / `WidgetIntents.swift` をメインAppターゲットに追加しない（Widget Extensionターゲットのみ）
- App Group ID をメインAppとWidget Extensionで一致させ忘れる（`group.jp.brainbox.app` で統一）
- Widget Extensionターゲットの Minimum Deployment を iOS 17 未満のままにする（`Button(intent:)` がビルドエラーになる）
- `WidgetTaskItem` / `WidgetShopItem` の `id` を JS側の送信データから外す（タップ完了機能がどのアイテムか特定できなくなる）
- ウィジェット内の見出し文言を`Text(someStringVariable)`のように一度`String`型を経由して渡さない（`Localizable.xcstrings`があっても翻訳が反映されない。`Text("リテラル")`か、`LocalizedStringKey`型のパラメータ経由で渡すこと）
- `Localizable.xcstrings`をメインAppターゲットに追加しない（Widget Extensionターゲットのみ。ウィジェット内の文言専用のカタログ）
- Android側で`AppWidgetProvider`用の`PendingIntent`の`requestCode`を全行・全ウィジェットインスタンスで固定値にしない（同じ`requestCode`だと後から作った`PendingIntent`のextraで前のものが上書きされ、どの行をタップしても最後のidだけが送られる不具合になる。`appWidgetId`と行indexを組み合わせて一意にすること）
- Android側でRemoteViewsのタップ判定をタスク最大4件・買い物最大6件という前提を超えて拡張する時、固定行のレイアウトを増やさず`RemoteViewsService`（可変長リスト）へ安易に切り替えない（実装コストが大きく上がるため、まず表示件数の上限を増やすだけで足りないか検討すること）

**過去の不具合: `widget_combined.xml`の区切り線に使っていたプレーンな`<View>`要素のせいで、「次の予定 & 買い物リスト」ウィジェットが常に「ウィジェットを読み込めません」になっていた。** RemoteViews（ホーム画面ウィジェットが使う、制限されたView階層でのみレイアウトを描画する仕組み）は、`FrameLayout`/`LinearLayout`/`RelativeLayout`/`GridLayout`と`TextView`/`ImageView`/`ImageButton`/`Button`/`ProgressBar`等、決められたクラスしかサポートしない。素の`android.view.View`はこの許可リストに入っておらず、`LayoutInflater.failNotAllowed()`が`InflateException: Class not allowed`を投げてinflateごと失敗する（Logcatで`brainbox`フィルタし、`Error inflating RemoteViews`→`Caused by: ... Class not allowed`という行が実際の手がかりだった）。修正: 縦の区切り線として使っていた`<View android:background="#E5E7EB".../>`を、同じ見た目のまま`<ImageView>`に置き換えた（`ImageView`はRemoteViewsで許可されているため、単色の背景を持つだけの区切り線としてそのまま使える）。**RemoteViewsを使うレイアウトXML（`widget_combined.xml`等）に新しい要素を追加する時は、素の`<View>`を使わず、区切り線的な用途でも`<ImageView>`や`<LinearLayout>`のような許可されたクラスで代用すること。**

**同じ調査で踏んだ罠: クラウドセッション側でファイルを編集・commit・pushしても、ユーザーのMac上のローカルリポジトリには自動的には反映されない。** `cp native-android/... android/...`をローカルのターミナルで実行しても、コピー元の`native-android/...`自体がローカルではまだ古いバージョンのままだと、当然コピー先も古いままになる（`diff`で比較しても「差分なし」と出るため、一見コピーコマンドが機能しているように見えてしまい、原因究明が長引いた）。**ユーザーのローカル環境で作業してもらっている最中に、クラウド側（このセッション）でリポジトリのファイルを修正してpushした場合は、次にローカル側でそのファイルを使う操作（`cp`等）をお願いする前に、必ず`git fetch origin && git reset --hard origin/main`（または該当ブランチ）をローカルで実行してもらい、最新化されたことを確認すること。**

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

`ShopNotifPanel`（時間指定通知）・`ShopLocationPanel`（場所通知）とも、「＋追加」を押すとカードをインライン展開するのではなく`fixed inset-0 z-[100]`のポップアップ（ボトムシート）で入力フォームを表示する（`ForgetAlertsPanel`と同じパターンに統一）。`ShopLocationPanel`の地図ピッカー（`ShopMapPicker`）はさらに上の`z-[110]`ポップアップとして開く。`ShopNotifPanel`の`<input type="time">`は`overflow-hidden rounded-xl`のdivで囲み、丸角カードからのはみ出しを防いでいる。

**登録フロー:** 「追加」→ 場所検索（[Nominatim](https://nominatim.openstreetmap.org/search)をAPIキー無しで直接fetch）／「地図で指定」／「現在地から登録」（現在地取得は後述の `getCurrentCoords()` 経由）→ 半径（100/300/500m）を選択→登録。登録時に `ensureGeofencePermission()` で位置情報「常に」＋通知の許可をリクエストし、拒否されている場合は許可されるまで登録しない。「地図で指定」は地図をブロックせず即座に表示し、裏で現在地取得を試みてピンを自動的に現在地へ寄せる（失敗時は東京駅付近の既定値のまま静かにフォールバック）。「現在地から登録」は取得完了を待ってから地図を現在地中心で開く。

**現在地取得は `navigator.geolocation` を使わない（重要・過去の不具合）:** 当初 `navigator.geolocation.getCurrentPosition`（WKWebView標準Web API）で実装していたが、**実機で位置情報の許可（「共有時」）が下りている状態でも、成功・失敗どちらのコールバックも一切呼ばれずに永久に固まる**という不具合が実際に発生した（ブラウザ版では同じコードで問題なく動作するため、Capacitorが独自スキーム`capacitor://localhost`でコンテンツを配信するWKWebView環境特有の問題と判明。`@capacitor/geolocation`という専用npmプラグインが存在するのもこの信頼性問題が理由）。この修正以降、現在地取得は `src/app/page.tsx` の `getCurrentCoords(timeoutMs)` を経由すること。ネイティブでは `GeofencePlugin.getCurrentLocation()`（`CLLocationManager.requestLocation()` を直接呼ぶ）を使い、Web/開発環境のみ `navigator.geolocation` にフォールバックする。`useMyLocation`（`ShopMapPicker`のクロスヘアボタン）・地図オープン時の自動現在地寄せ・`useCurrentLocation`（「現在地から登録」）はすべてこの関数経由。

**検索API: Nominatim（住所検索APIから切り替え済み）** 国土地理院の住所検索APIは正式な住所（町名・字名）専用で、「イオンモール福岡」のような施設名・ランドマーク名を検索すると無関係な住所がヒットすることがあった（例: クエリ中の「イ」だけが千葉県のある地区の字名と偶然一致してしまう）。Nominatim（OpenStreetMapのジオコーダー）はPOI・施設データも持っているため施設名検索の精度が高い。`https://nominatim.openstreetmap.org/search?format=json&q=...&countrycodes=jp&limit=8&accept-language=ja` を直接fetchし、`display_name`/`lat`/`lon`（lat/lonは文字列なのでparseFloat）を使う。CORSキー不要・ブラウザの`Referer`ヘッダーで利用規約上の送信元識別要件を満たす。逆ジオコーディング（座標→住所名）は引き続き国土地理院の[逆ジオコーディングAPI](https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress)を使用（こちらは正式住所を返す用途なので問題ない）。

位置情報または通知が拒否されている場合、パネル上部に設定アプリへの案内文を表示する（`checkGeofencePermissions()` で状態確認）。

**地図ピッカー（`ShopMapPicker`）:** 追加npmライブラリ無しで標準OpenStreetMapのラスタタイル（`https://tile.openstreetmap.org/{z}/{x}/{y}.png`、APIキー不要）を直接fetchして3x3グリッドで描画する自前の軽量地図。ピンは画面中央に固定表示、ドラッグで地図側を動かして位置を決める（Google/Appleマップと同じUX）。2本指ピンチで拡大縮小もできる（`pinchScale`でタイル層のみを視覚的にscale()し、指を離した時点で最も近い整数ズームに丸めてタイルを再取得。タッチイベントは`e.stopPropagation()`でボトムシートのタブ切り替えスワイプに伝播しないようにしている）。座標⇔ピクセル変換は標準的なWeb Mercatorタイル計算（`lonLatToPx`/`pxToLonLat`）。確定時は国土地理院の逆ジオコーディングAPIで地名を試みに取得し、失敗時は「地図で指定した場所」にフォールバックする。地図上に「© OpenStreetMap」表記を常時表示している。

**タイル配信元の変遷（重要・再発した実績あり）:** 当初は標準OpenStreetMapタイルを使っていたが「見づらい」フィードバックを受けCARTO Voyagerのラスタタイル（`basemaps.cartocdn.com`、Googleマップに近い見やすい配色）に切り替えた。**その後CARTOが匿名無料アクセスにAPIキーを必須化し、`basemaps.cartocdn.com`が403 "API KEY REQUIRED"を返すようになったため、地図が全く表示されない（タイル画像の代わりにCARTOのエラーページ画像が表示される）不具合が発生した。** 実機のスクリーンショットで「API KEY REQUIRED carto.com/basemaps/apikey」という文字が地図上に敷き詰められているように見えたら、この不具合を疑うこと。標準OpenStreetMapタイルに戻して復旧済み。**サードパーティの無料タイル配信元（CARTO・Stadia/Stamen等）はいつAPIキー必須化・仕様変更されてもおかしくないため、見た目重視で別サービスへ切り替える提案が来た場合は、必ず`curl -I`等で実際にタイルURLが200を返すことを確認してから切り替えること。再発防止のため定期的な死活監視の仕組みは無いので、ユーザーから「地図が表示されない」報告があったら、まずこの配信元切り替わりを疑って`curl`で確認するのが最短の切り分け手順。**

- **地図内検索:** 地図の上部に検索バーがあり、Nominatimでの検索結果をタップすると地図がその位置に再センタリングされる（ドラッグ不要で直接ジャンプできる）
- **現在地表示:** 地図左下の照準アイコン（`AppIcons.crosshair`）をタップすると `getCurrentCoords()` で現在地を取得し、地図を現在地に再センタリング＋青い現在地ドット（`myLocation` state）を表示する。中央固定ピンとは別レイヤーで、ドラッグしても現在地ドットの実座標は変わらず、画面内の相対位置だけが再計算される
- 確認ステップ（半径選択画面）の場所名は編集可能な入力欄になっている（検索結果や逆ジオコーディングの結果を初期値にしつつ、登録前に自由に書き換えられる）

**登録済み場所の名称変更:** `ShopLocationPanel` の一覧で場所名をタップするとインライン編集になる（`editingId`/`editingName` state、Enterまたはフォーカス外れで確定）。`CustomTab` のインライン名前編集と同じUXパターン。

本物のGoogleマップ/Apple MapKitへの変更も可能だが、それぞれAPIキー発行・課金設定（Google）またはMapKit JS用の秘密鍵発行・JWT設定（Apple）というユーザー側の作業が必要なため、現状は無料でAPIキー不要な標準OpenStreetMapタイルを採用している。

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

**通知文の英語対応:** 買い物リストの場所通知・「あとでやる」タスクの場所通知・忘れ物防止アラートはすべてバックグラウンド/未起動でも発火するため、`syncTaskAlerts`等のJS側通知（`tr()`で言語判定）と違い、`GeofencePlugin.swift`内で発火時点に直接ja/enを判定して文言を組み立てている。判定材料は`WidgetDataPlugin.updateWidgetData()`が（`tasks`/`shopItems`/`themeColor`変更のたびに呼ばれる既存の同期エフェクトに相乗りして）App Groupの`UserDefaults`に書き込む`appLanguage`キー（`"ja"`/`"en"`）。`GeofencePlugin.swift`の`isEnglish()`ヘルパーがこれを読んで判定する。新しくバックグラウンドで発火するネイティブ通知を追加する時は、JSの`tr()`は呼べないことを前提に、同じ`appLanguage`キー経由でja/enを判定するパターンに倣うこと。

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

### Android実装（`native-android/`、GeofencingClient + SharedPreferencesでの自前ブックキーピング）

`LocalNotifyPlugin`と同じくCapacitorプラグイン名を`GeofencePlugin`で揃えているため、`src/app/components/Geofence.ts`は原則無改修で動く（例外は後述の`shopItemsJson`）。

- `native-android/GeofencePlugin.kt` — Capacitorプラグイン本体。`setGeofences`/`setTaskLocationGeofences`/`setForgetAlerts`/`requestPermissions`/`checkPermissions`/`getPendingGeofenceAction`/`getFiredTaskLocationIds`/`getCurrentLocation`/`openAppSettings`をiOS版と同じメソッド名・引数で実装
- `native-android/GeofenceReceiver.kt` — `GeofencingClient.addGeofences()`で登録したジオフェンスの境界通過を受け取る`BroadcastReceiver`。`didEnterRegion`/`didExitRegion`+3つのhandle関数に相当する処理をすべてここに集約している
- Google Play services location（`GeofencingClient`/`FusedLocationProviderClient`）を使うため、`android/app/build.gradle`の`dependencies`に`implementation "com.google.android.gms:play-services-location:21.3.0"`の追加が必要（Kotlinプラグインと同様、`npx cap add android`の既定テンプレートには含まれていない）

**iOSの`CLLocationManager.monitoredRegions`（現在監視中の一覧を取得するAPI）に相当するものがAndroidの`GeofencingClient`には無い。** そのため`LocalNotifyPlugin`のAlarmManagerと同じ設計で、SharedPreferences（`GeofencePlugin.PREFS_NAME`）にprefixごとの登録済みリクエストID一覧を自前で保存し、`setGeofences`等が呼ばれるたびにその一覧で`removeGeofences(idsList)`してから新しい一覧を`addGeofences()`する（全解除→再登録方式はiOSと同じ）。

**Androidのジオフェンス用`PendingIntent`は`FLAG_MUTABLE`で作る必要がある（重要）。** Android 12+では`FLAG_IMMUTABLE`のPendingIntentを`GeofencingClient.addGeofences()`に渡すと`IllegalArgumentException`になる。他のプラグイン（`LocalNotifyPlugin`のアラーム用PendingIntent等）は逆に`FLAG_IMMUTABLE`を使っているため、混同しないこと——ジオフェンス用だけがこの例外。

**買い物リストの通知本文はiOS版と取得元が異なる（既知の意図的な差分）。** iOS版はWidgetDataPluginが書き込むApp Group共有の`widgetShopJson`を発火時点に読むが、**WidgetDataPluginはAndroid未移植**のため、`Geofence.ts`の`setShopGeofences(locations, shopItemNames)`に第2引数を追加し、ジオフェンス登録時点の未購入アイテム名をそのまま`GeofencePlugin.kt`のSharedPreferences（`shopItemNames`キー）に保存しておき、発火時にそこから読む設計にした。呼び出し元は`App`コンポーネントの該当`useEffect`（`shopItems`を依存配列に追加済み）。WidgetDataPluginを将来Androidに移植した後もこの仕組みは変更不要（そのまま両立できる）。

**通知文の言語判定はWidgetDataPluginのAndroid移植により、iOS版と同じ方式に揃えている（解消済み）。** `WidgetDataPlugin.kt`（`widget_prefs`）が`tasks`/`shopItems`/`themeColor`変更のたびに書き込む`appLanguage`キー（アプリ内で手動選択した言語）を`GeofenceReceiver.kt`の`appLang(context)`が優先して読む。JSが一度も`updateWidgetData()`を呼んでいない場合（インストール直後等）のみ端末のシステムロケール（`Locale.getDefault()`）にフォールバックする。

**通知タップ時のディープリンクはこの移植で新規に完成させた。** `BrainBoxNotifications.show()`に`openLater`引数を追加し、タップ時に開く画面を`openShop`/`openLater`で指定できるようにした。`MainActivity`の`onCreate`/`onNewIntent`（`launchMode="singleTask"`のため両方をハンドルする必要がある）で、通知タップで起動された場合のIntent extra（`fromNotification`/`openShop`/`openLater`）を読み、`GeofencePlugin.getPendingGeofenceAction()`が読み取るのと同じSharedPreferencesにフラグを書き込む。iOS版で`GeofencePlugin.swift`の`UNUserNotificationCenterDelegate.didReceive`が全通知カテゴリ共通で担っている役割を、Android側ではこの`MainActivity`に集約している（`LocalNotifyPlugin`のアラート通知タップでも同じ経路が効く）。

**Androidの位置情報許可はiOSより手順が多い。** iOSの`requestAlwaysAuthorization()`は1回で完結するが、Android 10+では前景位置情報（`ACCESS_FINE_LOCATION`）→バックグラウンド位置情報（`ACCESS_BACKGROUND_LOCATION`）を別々のダイアログで順にリクエストする必要がある（同時にリクエストするとシステムに拒否される）。`GeofencePlugin.kt`の`requestPermissions()`は`location`→`backgroundLocation`→`notifications`の順に`@PermissionCallback`を連鎖させて実装している。

### Android Studioでの手動セットアップ（`android/`はgitignore対象なので毎回必要）

1. `native-android/GeofencePlugin.kt` / `GeofenceReceiver.kt` を `android/app/src/main/java/jp/brainbox/app/` にコピー
2. `native-android/MainActivity.java` の内容で既存の `MainActivity.java` を上書きする（`registerPlugin(GeofencePlugin.class)` の行と、通知タップ処理の`handleNotificationIntent()`が追加されている）
3. `native-android/GeofenceManifest.snippet.xml` の内容を `android/app/src/main/AndroidManifest.xml` に追加（`<uses-permission>` 3行は `<manifest>` 直下、`<receiver>` は `<application>` タグの内側）
4. `android/app/build.gradle` の `dependencies` に `implementation "com.google.android.gms:play-services-location:21.3.0"` を追加する
5. `native-android/BrainBoxNotifications.kt` の内容を最新化する（`openLater`引数が追加されている。既存ファイルを上書き）
6. Android Studioで「Sync Now」→ビルドが通ることを確認する
7. これらのファイルを編集した場合、`android/` 内の既存ファイルは `git pull` しても自動更新されない（`native-android/` の最新内容を都度コピーし直すこと。`LocalNotifyPlugin`の節と同じ注意事項）

### 避けるパターン

- ジオフェンス発火時の通知処理をJS側（`new Notification(...)`）で行おうとしない（バックグラウンド/未起動では動かない。必ず `GeofencePlugin.swift` 内の `UNUserNotificationCenter` 直接呼び出しで完結させる。Android版は`GeofenceReceiver.kt`内で完結させる）
- 位置情報を通知判定以外の用途で保存・送信しない（サーバー送信や履歴保存はしない。`UserDefaults`/`SharedPreferences` に保存するのはクールダウン用タイムスタンプと場所名の辞書のみ）
- `AppDelegate.swift` を編集して `UNUserNotificationCenterDelegate` を設定しようとしない（`GeofencePlugin.load()` 内で完結させる設計にしてあるため不要）
- 現在地の一度きりの取得に `navigator.geolocation` を直接使わない（実機でコールバックが一切呼ばれず固まる不具合の実績あり。`GeofencePlugin.getCurrentLocation()` を使う `getCurrentCoords()` 経由にすること）
- Androidのジオフェンス用`PendingIntent`を`FLAG_IMMUTABLE`で作らない（Android 12+で`IllegalArgumentException`になる。`FLAG_MUTABLE`が必須）
- Android側で前景位置情報とバックグラウンド位置情報を同時にリクエストしない（システムに拒否される。`location`→`backgroundLocation`の順で別々にリクエストすること）

---

## タスクの住所・「あとでやる」の場所通知（PRO機能）

**「住所」欄と「場所で通知」は1つの入力フローに統合済み（過去に別々の場所選択UIが2つ並んでいて紛らわしいという指摘を受けて統合した）。** 買い物リストの場所通知（`ShopLocation`）とは別に、個別の「あとでやる」タスクにも場所を設定し、到着時に通知できる。買い物リストの場所通知と同じ `GeofencePlugin`/`CLLocationManager` を共有するが、`"task-loc-"` prefixで完全に別管理する（`"shop-"` prefixとは独立）。

### 型・保存

- `Task.address?:string` — 表示用の住所（自由入力、全タスクタイプ、**無料機能**）。通知・ジオフェンスとは無関係の単なる文字列
- `Task.locationNotify?:boolean` / `Task.location?:{name:string;lat:number;lng:number}` — 到着通知の対象座標。半径は初回実装では固定値 `TASK_LOCATION_RADIUS_M=200`（m）

### タスク作成・編集画面（TaskModal）

**「住所」欄1つに統合**（全タスクタイプ共通、無料）。直接入力／「地図で指定」（`ShopMapPicker`）／「現在地から」の3通りで入力できる。地図・現在地から場所を選んだ場合は、確定時に`address`（表示テキスト）と`location`（通知用の緯度経度）を**同時に**セットする（`onConfirm={loc=>{setAddress(loc.name);setTaskLocation({name:loc.name,lat:loc.lat,lng:loc.lng});...}}`）。手入力だけの住所には座標が無いため、場所通知の対象にはできない。

**`mode==='later'`の時だけ**、住所欄を開いた中に「場所で通知」PROトグルが追加で表示される。**住所入力欄・地図で指定／現在地からボタンより上に配置**（過去は下だったが、目立たせるために上に移動済み）。ONにする条件: ①PRO、②`taskLocation`（座標）が設定済み＝地図/現在地で場所を選んだことがある、③`MAX_MONITORED_REGIONS`の上限に達していない、④`ensureGeofencePermission()`で位置情報・通知の許可が確認できる。いずれか欠けている場合は`locError`にメッセージを表示してブロックする（座標が無い場合は`taskLocationNeedsMapNote`＝「地図で場所を選択すると、通知を設定できます。」）。

**トグルをOFFにしても`address`/`location`（座標）は消さない**（住所欄自体は独立した表示情報として残るべきなので、通知のON/OFFだけを切り替える）。**住所テキストを空にした時だけ`location`と`locationNotify`もまとめてクリアする**（住所入力の`onChange`で`v.trim()`が空になった瞬間に`setTaskLocation(null);setLocationNotify(false);`を呼ぶ。「住所が無い＝紐づく通知設定も無い」という一貫した仕様）。

**登録上限（`MAX_MONITORED_REGIONS=19`）:** `CLLocationManager`が同時監視できるリージョンはアプリ全体で20件までで、買い物リストの場所通知と予算を共有する。`App`コンポーネントの`activeLocationRegionCount`（有効な買い物場所通知数＋他タスクの場所通知数）が上限に達している状態でONにしようとすると、`locError`に「場所通知の登録上限に達しています。他の場所通知をオフにしてから追加してください。」を表示してブロックする。

### タイムラインとの連携・時間通知と場所通知の独立性

タイムラインにドロップして時間指定タスクになっても（`isLater`がfalseになっても）`locationNotify`/`location`は維持される。これはApp側の場所通知同期エフェクトが `isLater` で絞り込まず `!t.completed && t.locationNotify && t.location` だけでフィルタしているため、特別な分岐は不要（既存の「`tasks`変更のたびに全解除→再登録」という設計そのもので自然に実現している）。

ドロップ時に時間通知（`notifications:[0]`＝開始時刻ちょうど）が付くのは、ドラッグ&ドロップ・空き時間カードからの予定化で既存から入っている挙動（`scheduleInSlot`/ドラッグの`onEnd`が`notifications`が空なら`[0]`を補う）で、今回新たに実装したものではない。結果として「時間通知（開始時刻）」と「場所通知（到着時）」が両方セットされる状態になり得るが、**この2つは完全に独立して動作し、どちらか一方が発火してももう一方を解除しない**（後述）。

**設計方針（重要）:** 当初は「先に発火した方を採用し、もう片方を解除する」というOR条件の設計だったが、BrainBoxはADHD傾向のユーザーを前提としているため撤回した。ADHDの特性上「通知に気づいても別の行動に移ってしまう」「お店の前を通っても素通りしてしまう」ことがあり得るため、片方の通知だけで確実に思い出せるとは限らない。**「通知を減らす」のではなく「思い出すきっかけを増やす」ことを優先し、時間通知と場所通知はそれぞれ独立して発火する（重複して両方届くことがあっても問題としない）。**

### 通知の頻度（あとでやる中は毎日1回まで、時間指定になったらその日だけ）

ユーザーからのフィードバックを受け、「到着で1タスク1回のみ・以降完全に無効化」という初回実装から、以下のように変更済み:

- **「あとでやる」の間（`isLater:true`）**: 同じ場所に着くたびに毎回通知すると煩わしいが、完全に1回きりだとADHD特性上「気づいても行動できなかった」場合に二度と思い出せなくなる。折衷案として**1日1回を上限に、あとでやる状態が続く限り毎日発火し続ける**
- **タイムラインにドロップして時間指定タスクになった後（`isLater:false`）**: 「いつやるか」がすでに決まっているため、その`date`と一致する日だけ発火する（例: 9/30に時間指定したタスクなら、9/30に登録した場所へ近づいた時だけ通知。9/29や10/1に同じ場所へ寄っても通知しない）

`Geofence.ts`の`TaskLocationGeofence`に`date?:string`を追加し、App側の同期エフェクトが`isLater`なら`date:undefined`、時間指定なら`date:t.date`を渡す（`setTaskLocationGeofences(locTasks.map(t=>({...,date:t.isLater?undefined:t.date})))`）。ネイティブ側（`GeofencePlugin.swift`/`.kt`）が`taskLocationDates`（id→date辞書、dateが無いキーは「あとでやる」扱い）に保存し、`didEnterRegion`→`handleTaskLocationEnter()`発火時に:
1. `taskLocationDates`にこのタスクの`date`があり、かつ今日の日付と一致しなければ何もせず終了（時間指定タスクでまだその日ではない）
2. `taskLocationLastNotified_<taskId>`（前回発火した日付文字列）が今日と同じならスキップ（1日1回の上限）
3. 今日の日付を`taskLocationLastNotified_<taskId>`に記録してから通知を表示（title=タスク名、body="この場所に着きました。"、`userInfo:["openLater":true]`）
4. **リージョンの監視は解除しない**（翌日以降・時間指定タスクのその日再訪でも判定を続ける必要があるため。旧実装にあった`stopMonitoring`は撤去済み）

`willPresent`デリゲート・`handleTaskLocationEnter()`のどちらからも、もう一方の通知（時間通知⇔場所通知）を解除する処理は**意図的に行わない**（旧実装にあった相互キャンセルは撤去済み）。

`setTaskLocationGeofences()`は呼ばれるたびに全解除→再登録するが、発火済みかどうかによるスキップは**行わない**（1回発火しても翌日また発火する必要があるため、登録側では絞り込まず、絞り込みは`handleTaskLocationEnter()`内の日付クールダウンで行う）。

### アプリ再開時のリコンサイル（`getFiredTaskLocationIds`）

バックグラウンド中に場所到着で発火したタスクIDは、アプリがフォアグラウンドに戻ったタイミング（`visibilitychange`）で`getPendingWidgetActions`/`getPendingGeofenceAction`と同じ`applyPending()`内から`getFiredTaskLocationIds()`を呼んで取得する。**現在はアナリティクス計測（`location_reminder_triggered`）専用**で、`locationNotify`を無効化する処理はしない（発火後も毎日/その日再訪で発火し続ける仕様のため）。`taskLocationFiredIds`リスト自体は読み取り後にクリアされるが、日付クールダウンの記録（`taskLocationLastNotified_<id>`）は別物なのでここではクリアしない。

### タスク完了・削除時

特別な解除コードは無い。場所通知の同期エフェクトが`tasks`の変更のたびに`!t.completed`かつ`locationNotify`のタスクだけを全解除→再登録するため、完了（`completed:true`）または削除（`tasks`配列から除去）すれば次の同期で自動的に対象から外れる。

### 通知タップ時の画面遷移

買い物リストの場所通知と同じ`UNUserNotificationCenterDelegate`（`GeofencePlugin.load()`で設定済み）を使う。`userInfo:["openLater":true]`を見て`pendingOpenLaterList`フラグを立て、JS側は`getPendingGeofenceAction()`の戻り値`shouldOpenLater`を見て`setActiveTab('later')`で「あとでやる」を開く（`shouldOpenShop`と同じ仕組み、返り値の形が`boolean`から`{shouldOpenShop,shouldOpenLater}`に変わった点に注意）。

### Xcodeでの手動セットアップ

`GeofencePlugin.swift`/`.m`は新規ファイルではなく**既存ファイルの更新**なので、Xcode上の同名ファイルの中身をこの変更後の内容に差し替える（買い物リストの場所通知で使っていたファイルと同じ物理ファイル）。App Group・Info.plist・Background Modesは買い物リストの場所通知ですでに設定済みならそのまま流用でき、追加設定は不要。

Android版も同様に`GeofencePlugin.kt`/`GeofenceReceiver.kt`は買い物リストの場所通知と同じ物理ファイル（`"task-loc-"` prefixのロジックも同じファイルに含まれている）。追加のセットアップ手順は無い（買い物リストの場所通知の節にある「Android Studioでの手動セットアップ」がそのままこの機能もカバーする）。

### 避けるパターン

- 場所通知の発火判定・重複防止ロジックをJS側だけで完結させようとしない（バックグラウンド/未起動で動く必要があるため、`didEnterRegion`/`willPresent`内のネイティブコードが主役）
- 場所通知を「1タスク1回のみ発火したら停止する」設計に戻さない（`stopMonitoring`で二度と発火しない方式は撤去済み。あとでやるタスクは`taskLocationLastNotified_<id>`による1日1回のクールダウン、時間指定タスクは`taskLocationDates`との日付一致判定で、リージョン監視自体は解除せず発火頻度だけを制御する設計）
- 「あとでやる」以外のタスク（時間指定・繰り返し）に場所で通知トグルを表示しない（`mode==='later'`限定。住所欄自体は全タスクタイプ共通）
- 場所で通知をOFFにした時に`address`/`location`を消さない（統合後は住所欄自体が独立した表示情報のため。`location`をクリアするのは住所テキストを空にした時だけ）
- 場所検索専用の別UI（Nominatim検索ボックス・確認ステップ等）を「場所で通知」のために復活させない。地図で選んだ場所の座標を`location`にセットする経路は住所欄の「地図で指定」「現在地から」に一本化済み
- 時間通知と場所通知の間に相互キャンセル（OR条件）を再導入しない（ADHD傾向のユーザーを前提に意図的に撤去した設計。両方届いても問題として扱わない）

---

## 忘れ物防止アラート（設定 → 忘れ物防止アラート、PRO機能）

「あとでやる」とは完全に独立した機能。「何をするか」ではなく「何を持っていくか」を管理する（例: 自宅を出るときに財布・鍵・社員証を確認）。買い物リスト・タスクの場所通知と同じ`GeofencePlugin`/`CLLocationManager`を共有するが、`"forget-"` prefixで別管理する。**到着(Enter)・退出(Exit)のどちらをトリガーにするかをアラートごとに選べる**（初回実装ではExit固定だったが、後に`trigger`フィールドを追加してEnterも選択可能にした）。

### 型・保存

```typescript
interface ForgetAlert {
  id: string; name: string; location: { name:string; lat:number; lng:number }; radius: 100|300|500;
  trigger: 'enter'|'exit';
  weekdays: number[]; timeStart?: string; timeEnd?: string; enabled: boolean; items: string[];
}
```
`FORGET_ALERTS_KEY='tl-forget-alerts-v1'`に配列で保存。`weekdays`は`0=日〜6=土`。`timeStart`/`timeEnd`は両方空なら終日対象。`radius`はShopLocationと同じ100/300/500mから選択可能（新規追加時のデフォルトは300m）。`trigger`は新規追加時のデフォルト`'exit'`（従来の「出るとき」挙動を維持）。旧データ（`trigger`/`radius`未設定）はJS側で`a.trigger??'exit'`・`a.radius??TASK_LOCATION_RADIUS_M`にフォールバックする（`ForgetAlertsPanel.startEdit()`・同期エフェクトの両方）。ネイティブ側（`GeofencePlugin.swift`の`ForgetAlertEntry`/`setForgetAlerts`）は元々`entry.radius`で`CLCircularRegion`を作っていたため、半径の変更自体にネイティブ側の追加対応は不要だった。

**課金プラン: 1件までは無料、2件目以降はPRO。** `ForgetAlertsPanel`内の`isLockedByPlan(idx)`（`!isPremium&&idx>0`、`idx`は`alerts`配列内の作成順インデックス）で判定する。「＋追加」は非PROかつ既に1件以上ある場合に`onProPrompt()`でブロックし、既存の2件目以降の有効化トグルも同様にブロックする（OFFにする操作は常に許可。ダウングレードで2件目以降が残っている場合の表示用に、対象行に小さい★アイコンを出す）。

### 管理画面（`ForgetAlertsPanel`、設定 → 忘れ物防止アラート）

専用のフルスクリーン画面ではなく設定画面のサブ画面（`sub==='forgetAlerts'`）として実装（初回実装の方針通り）。一覧はカード形式で「{name}を出るとき」（`trigger==='enter'`の場合は「{name}に着いたとき」）＋曜日・時間帯・半径のサマリ＋確認する持ち物のチップ＋ON/OFFトグル＋削除ボタン。

**「入力」と「確認」の役割を分離してある。** 入力は項目を上から順に並べたフォーム形式（場所→通知する範囲→条件→曜日→時間帯→持ち物）、確認はフォーム最下部に常時表示される文章形式のプレビューという構成。以前は文章の穴埋め形式（タップで下にピッカーが展開するアコーディオン）だったが、「どこを操作すればいいか分かりにくい」「入力中か確認中か判断しづらい」というフィードバックを受けてこの形に変更した。

- **場所**: 自由入力（名前プリセットは廃止済み。「なくしたい」というフィードバックを受けて削除した）＋「地図で指定」「現在地から」＋通知する範囲（100/300/500m）。「地図で指定」「現在地から」を押すと`ShopMapPicker`が**さらに上のポップアップ（`z-[110]`）として**開く（`ShopMapPicker`自体が地図内検索(Nominatim)を内包しているため、外側フォームに住所検索ボックスは不要）
- **条件**: 「到着したら」/「出発したら」の2択（`trigger`）
- **曜日**: 「毎日」「平日」「休日」「カスタム」のプリセットボタン＋（カスタム選択時、または既存の組み合わせがどのプリセットにも一致しない場合のみ）7つの丸ボタン。プリセット判定は`dayPreset(weekdays)`が行う
- **時間帯**: 開始/終了の`<input type="time">`＋「解除」（任意、指定しなければ終日）
- **持ち物**: 自由入力のみ（候補チップは廃止済み。名前プリセットと同じ理由で削除した）＋登録済みチップの×で削除
- **プレビュー**: フォーム最下部に常時表示される`previewText(editing)`が生成する文章（例:「平日、職場を出るとき、\n財布、鍵を確認してください。」）。時間帯を指定していない場合は「の終日に」という不自然な言い回しになるのを避け、時間帯の句自体を省略する（`d.timeStart&&d.timeEnd`の時だけ`${day}の${timeStart}〜${timeEnd}に`を付け、それ以外は`${day}、`だけにする）。入力内容の変更にリアルタイムに追従する。別ポップアップには分離していない（入力と確認を同じスクロール内に置き、常に両方が見える状態を維持する狙い）
- 一番下の「保存」/「登録」ボタンで直接確定する（中間の「次へ」ステップは廃止済み）。`saveEditing()`が位置情報許可チェックと実際の保存を行う

**バリデーション:** 名前・場所・曜日1つ以上・持ち物1つ以上が揃うまで「保存」/「登録」ボタンは無効。

### 登録上限の共有

買い物リストの場所通知・タスクの場所通知と同じ`CLLocationManager`の20リージョン上限を共有する。`App`コンポーネントの同期エフェクトが、それぞれ他の2つのカテゴリの現在の有効数を差し引いた予算内に収まるよう`slice()`する（`MAX_MONITORED_REGIONS=19`）。

### ネイティブ実装（`GeofencePlugin.swift`）

- `setForgetAlerts()` — 他の`set*Geofences`系と同じ全解除→再登録方式。`region.notifyOnEntry`/`notifyOnExit`を`entry.trigger`（`"enter"`/`"exit"`）に応じて排他的にセットする点が唯一の違い。曜日・持ち物等のメタデータは`UserDefaults`の`forgetAlertData`（id→`ForgetAlertEntry`の辞書）に保存する
- `didEnterRegion`/`didExitRegion`（`didExitRegion`はこのプラグインで新規追加したデリゲートメソッド。他の場所通知は全てEnterトリガーのため今まで実装していなかった）の両方から`forget-`prefixのリージョンを`handleForgetAlertFire(_:isEnter:)`という共通関数に振り分ける。`isEnter`で通知文言（「〜に着きました」/「〜を出ました」）を出し分ける
- **曜日・時間帯の判定は発火時点（=到着/退出した瞬間）の現在時刻でネイティブ側が行う**（JS側で事前計算はできない。時間指定通知や締切通知と違い、いつ到着・退出するか分からないため）。`Calendar.current.component(.weekday:)`はSunday=1〜Saturday=7なので、JS側の`0=日〜6=土`に合わせるため`-1`する
- 時間帯が日をまたぐ場合（例: 22:00〜2:00）は`inSleepWindow`と同様の判定ロジックを踏襲
- **1回きりの通知ではなく、条件を満たすたびに毎回発火する**（タスクの場所通知の「1回のみ・発火後はfired flagで再武装しない」という設計とは異なる。習慣的なリマインダーなのでOFFにしない限り繰り返し届くのが正しい仕様）
- GPS境界付近でのジッターによる連続発火だけを防ぐため、`forgetAlertLastNotified_<id>`による短いクールダウン（`forgetCooldown=10分`。買い物リストの場所通知の2時間クールダウンより大幅に短い）を設ける

### Xcodeでの手動セットアップ

`GeofencePlugin.swift`/`.m`は新規ファイルではなく**既存ファイルの更新**なので、Xcode上の同名ファイルの中身をこの変更後の内容に差し替える。App Group・Info.plist・Background Modesは買い物リストの場所通知ですでに設定済みならそのまま流用でき、追加設定は不要。

Android版も同様に`GeofencePlugin.kt`/`GeofenceReceiver.kt`は同じ物理ファイル（`"forget-"` prefixのロジックも含まれている）。追加のセットアップ手順は無い（買い物リストの場所通知の節の「Android Studioでの手動セットアップ」を参照）。

### 避けるパターン

- 忘れ物防止アラートの発火判定（曜日・時間帯チェック）をJS側で事前計算しようとしない（退出タイミングが予測できないため、`didExitRegion`内で発火時点の現在時刻を見て判定する必要がある）
- 忘れ物防止アラートに「1タスク1回のみ」の発火済みフラグ（タスクの場所通知と同じ仕組み）を導入しない（習慣リマインダーなので毎回の退出で繰り返し通知するのが正しい仕様。短いクールダウンでのGPSジッター対策のみ行う）
- 「あとでやる」のUI・データ構造（`Task.locationNotify`）を流用しない（`ForgetAlert`という独立した型・保存キー・ネイティブprefixを持つ別機能として実装済み）

---

## タスク名の音声入力（TaskModal、PRO機能）

タスク名入力欄の右にマイクボタンを置き、タップで録音開始→**無音を検知したら自動的に録音終了**し、認識結果をタスク名に反映する。もう一度マイクをタップすれば無音を待たず早めに切り上げることもできる。ホーム画面ウィジェット「音声でタスク追加」からも同じ機能を起動できる（後述）。

### 設計方針（無音自動終了・単一イベントでの結果通知）

**過去の失敗: 初回実装は`stop()`を手動タップ時のみ呼ぶ設計で、話し終わったら自動で確定してほしいという要望に合っていなかった。** さらにその後、`stop()`内で`recognitionRequest.endAudio()`の直後に`recognitionTask.cancel()`していたため、特に短い発話だと最終的な認識結果が届く前にタスクを打ち切ってしまい、テキストが空のまま返る不具合もあった。

現在の実装は、ネイティブ側で**無音が`silenceTimeout`（1.3秒）続いたら自動的に認識を終了する**設計にした。`SFSpeechAudioBufferRecognitionRequest`からの部分認識結果（`shouldReportPartialResults=true`）が届くたびにタイマーをリセットし、タイマーが発火した時点・`isFinal`な結果が届いた時点・手動停止のいずれかで`finishRecognition()`という単一の経路にまとめ、そこから`notifyListeners("recognitionFinished", {text})`を**1回だけ**発火してJS側にテキストを渡す。**このリポジトリで初めて`notifyListeners`によるイベント配信を使った箇所**だが、これはライブの部分認識結果（テキスト）を逐次流すものではなく、「認識が終わった」という一度きりの通知に限定している（`start`/`stop`自体は録音の開始・早期終了をリクエストするだけの単純なpromiseのまま）。**ただし後述の波形表示のため、テキストとは別に音量レベルだけは継続的にストリーミング配信している**——「テキストのライブ配信はしない」という制約と「音量レベルのライブ配信はする」という実装は矛盾しない別の話なので混同しないこと。

### 録音中のリアルタイム波形（`VoiceWaveform`、`audioLevel`イベント）

マイクボタン/ポップアップのどちらでも、録音中はただの静的なマイクアイコンではなく、実際の音量に反応する簡易的な棒グラフ波形を表示する。

- `native-ios/VoiceInputPlugin.swift`の`installTap`コールバック（`AVAudioPCMBuffer`が届くたび、オーディオスレッドで呼ばれる）内で`notifyAudioLevel(from:)`を呼ぶ。バッファのRMS（二乗平均平方根）を計算し`min(1.0, rms*6)`で0〜1に正規化した上で、`levelNotifyInterval`（0.08秒）に一度だけメインスレッドで`notifyListeners("audioLevel", {level})`を発火する（オーディオコールバックは非常に高頻度で呼ばれるため、間引かずに毎回送るとブリッジに負荷がかかる）。`finishRecognition()`の最後で明示的に`level:0`を1回送り、UIの波形をリセットする
- `src/app/components/VoiceInput.ts`の`onVoiceLevelUpdate(callback)` — `onVoiceInputFinished`と同じ「登録して解除用関数を返す」パターン。ネイティブは`audioLevel`イベントをそのまま橋渡しし、Web/開発環境は**Web Speech APIに音量取得手段が無いため、見た目確認用に`setInterval`でランダムな疑似値を生成するだけ**（実際の音量は反映されない。実機でのみ本物の値が届く）
- `VoiceWaveform`（`src/app/page.tsx`）— `level`（0〜1）を受け取り5本の棒の高さをCSS transitionで滑らかに変化させるだけの純粋な表示コンポーネント。色は`currentColor`任せなので、呼び出し側の`text-*`クラスがそのまま反映される。`size='small'`（マイクボタン内、`TaskModal`）と`size='large'`（`VoiceCapturePopup`）の2サイズを用意
- `TaskModal`内では、録音中だけマイクボタンの中身を`AppIcons.mic`から`VoiceWaveform`に差し替え、ボタン自体の幅も`w-8`→`w-12`に広げて波形が収まるようにする（`voiceLevel` stateを`onVoiceLevelUpdate`で更新する専用の`useEffect`を追加済み）

### 実装（マイクボタン本体、`TaskModal`）

- `native-ios/VoiceInputPlugin.swift`/`.m` — `Speech`（`SFSpeechRecognizer`）と`AVFoundation`（`AVAudioEngine`）を使用。`requestPermissions()`でマイク＋音声認識の許可を求め、`start(locale)`で`AVAudioEngine`のタップから`SFSpeechAudioBufferRecognitionRequest`に音声バッファを流し込む。部分認識結果のたびに`resetSilenceTimer()`で1.3秒のタイマーを張り直し、無音が続く・`isFinal`が届く・`stop()`が呼ばれる、のいずれかで`finishRecognition()`が呼ばれてマイクを解放し`notifyListeners("recognitionFinished", {text})`を発火する
- `src/app/components/VoiceInput.ts` — JSラッパー。`ensureVoiceInputPermission()`/`startVoiceInput(language)`/`stopVoiceInput()`（早期終了リクエスト、テキストは返さない）/`onVoiceInputFinished(callback)`（認識終了時に1回だけ呼ばれるリスナーを登録し、解除用の関数を返す）/`onVoiceLevelUpdate(callback)`（前述）。ネイティブでは`VoiceInputPlugin`のイベントリスナーを、Web/開発環境はブラウザのWeb Speech API（`webkitSpeechRecognition`、Chromiumのみ対応）の`onresult`/`onend`を橋渡しする（`continuous:false`にしているためブラウザ標準の無音自動終了がそのまま使える。動作確認用。Safariでは`voiceInputSupported()`がfalseを返しボタン自体を表示しない）
- `language`（アプリ内`Language`型）は`voiceLocaleFor()`でSFSpeechRecognizer/Web Speech APIのロケールID（`ja-JP`/`en-US`/`ko-KR`/`zh-TW`/`es-ES`/`pt-BR`/`vi-VN`/`th-TH`/`id-ID`）に変換してから渡す
- `TaskModal`のタスク名入力行（`name-input-row`）に`AppIcons.mic`ボタンを追加。非PROは`setModalProPrompt(tr('proFeatureVoiceInput'))`で`ProGateSheet`を表示してブロックする（他のPRO機能と同じパターン）
- `TaskModal`は`useEffect`（マウント時に1回）で`onVoiceInputFinished()`を登録し、届いたテキストを名前欄に反映する（既存のタスク名が空なら置き換え、入力済みなら末尾にスペース区切りで追記。`autoIcon`が有効なら`defaultIconKey()`でアイコンも追従）。**`autoIcon`は普通のstateではなく`autoIconRef`という参照経由で読む**——このuseEffectは空配列depsで1度しか登録されないクロージャのため、`autoIcon` stateを直接参照すると登録時点の値のまま固定されてしまう（stale closure）。値が変わるたびに追従させるため、毎レンダーで最新値を書き込む`autoIconRef`を経由している
- 録音中はタスク名入力欄のplaceholderが`tr('voiceInputRecordingLabel')`（「聞き取り中…」）に切り替わる
- マイク・音声認識どちらかの許可が拒否されている場合は`tr('voiceInputPermissionDenied')`を入力欄の下に赤字で表示する（`ShopLocationPanel`のような専用バナー・設定アプリへの遷移ボタンは持たない、最小限のインライン表示に留めている）
- `TaskModal`がアンマウントされた瞬間に録音中/処理中だった場合、`useEffect`のクリーンアップで`onVoiceInputFinished`の解除に加えて`stopVoiceInput()`を呼びマイクを解放する（`voiceStateRef`で最新状態をrefに追従させ、unmount時の1回だけ発火するクリーンアップから参照する）

### ウィジェット連携（「音声でタスク追加」ウィジェット、systemSmall、`VoiceCapturePopup`）

**当初はスコープ外にしていたが、後日追加した。** `native-ios/Widgets/BrainBoxWidgets.swift`の`AddLaterWidget`（既存の「あとでやるを追加」ウィジェット、`brainbox://addLater`というURLスキームへの`Link`をタップするだけでアプリ側の`appUrlOpen`イベントが拾って`openAdd()`を呼ぶ仕組み）が既にあったため、**新しいCapacitorプラグインやAppIntent／App Group経由のpendingフラグを増やさず、同じURLスキーム方式を使い回すだけで実現できた**。

**「ウィジェットから開いた時はTaskModalを開かず、専用のポップアップだけで完結させたい」という要望を受けて、初回実装（TaskModalを開いて自動的に録音を開始する方式）から設計変更した。** TaskModal全体（アイコン・モードタブ・時間指定・タグ等）を開くのは録音してから編集したい場合には便利だが、ウィジェットからの「話しかけるだけで一瞬で登録したい」という用途には過剰だったため。

- `AddLaterVoiceWidget`/`AddLaterVoiceWidgetView`（`AddLaterWidget`と同じsystemSmall、マイクアイコン）が`brainbox://addLaterVoice`という別のURLスキームへリンクする
- `src/app/page.tsx`の`appUrlOpen`リスナーが`addLaterVoice`を`addLater`より先にチェックする（`'addLaterVoice'.includes('addLater')`がtrueなので、判定順を間違えると`addLaterVoice`が常に通常の`addLater`分岐に吸われてしまう）。`addLaterVoice`の場合は`openAdd()`を呼ばず`setShowVoicePopup(true)`だけを呼ぶ

**過去の不具合（ロック画面ウィジェット`AddLaterVoiceLockScreenWidget`追加時に発覚）: アプリが未起動の状態（コールドスタート）でこのURLから開くと、タップしてもアプリが開くだけで音声入力ポップアップが出ないことがあった。** ホーム画面の`AddLaterVoiceWidget`（systemSmall）はアプリが既にバックグラウンドで動いていることが多く症状が出にくかったが、ロック画面ウィジェットは未起動からの起動になりやすく再現した。原因は、`appUrlOpen`イベントがJS側の`useEffect`（`CapApp.addListener('appUrlOpen',...)`、`deps=[loaded]`）がリスナーを登録するより先にネイティブ側で発火してしまい、Capacitorはリスナー未登録時に発火したイベントを後から再配信しないため、そのまま取りこぼされていたこと。**修正: 同じ`useEffect`内で`CapApp.getLaunchUrl()`（Capacitor Appプラグインが提供する、起動時のURLを明示的に取得できるAPI）も呼び、ライブの`appUrlOpen`イベントと同じ`handleUrl()`処理に通すようにした。** これにより、ライブイベントを取りこぼしても起動時URLの明示的な取得でカバーできる。**新しくURLスキーム経由でアプリを起動する導線（ウィジェット・文字盤コンプリケーション等）を追加する時は、`appUrlOpen`のライブリスナーだけに頼らず、`getLaunchUrl()`も合わせて呼ぶこのパターンに倣うこと**（未起動状態からの起動になりやすい導線ほどこの不具合が顕在化しやすい）。
- `VoiceCapturePopup`（`src/app/page.tsx`）— `App`直下に`{showVoicePopup&&<VoiceCapturePopup .../>}`として描画する独立したフルスクリーンポップアップ。マウント時の`useEffect`内で権限確認→`startVoiceInput()`→`onVoiceInputFinished`/`onVoiceLevelUpdate`の購読、まで一通り自前で行う（`TaskModal`の`toggleVoiceInput`とはコードが独立しており、あえて共通化していない——`TaskModal`側は「タップで開始・タップで停止」のトグル、こちらは「マウントで自動開始・結果が届いたら自動的に閉じる」という起動条件が異なるため、無理に共通関数へ抽出せずそれぞれの文脈に合わせて素直に書いた）
- 状態は`'starting'`（権限確認中）→`'recording'`（波形表示）→`'done'`（認識結果をプレビュー表示してから自動で閉じる）/`'error'`（権限拒否等）の4つ。`'done'`到達後は`text.trim()?700:900`msの短い待機を挟んでから`onDone(text)`を呼ぶ（結果が見える間を持たせるため）
- 非PROの場合は録音を一切開始せず、即座に`onProPrompt()`（設定→PRO画面）を呼んでポップアップを閉じる（`toggleVoiceInput`と同じ判断だが、`VoiceCapturePopup`はTaskModalの外で完結する独立コンポーネントのため`ProGateSheet`ではなく設定画面への遷移にしている）
- 認識結果は`App`の`addVoiceLaterTask(text)`が受け取り、`TaskModal`を一切介さず直接「あとでやる」タスクとして`saveTasks()`に渡す（`icon`は`defaultIconKey(text)`で自動判定、`startTime:null`・`duration:0`など「あとでやる」タスクの最小構成）。`saveTasks`は`modal.task`を見て新規/編集を分岐する関数だが、このフローでは`modal`自体を一度も開かないため`modal.task`は常に`null`のままであり、新規作成分岐がそのまま安全に使える
- 英語含む9言語ぶんの文言（ウィジェットのタイトル「音声でタスク追加」・説明文、ポップアップの「準備中…」「聞き取れませんでした」等）は`native-ios/Widgets/Localizable.xcstrings`・`I18n.tsx`に追加済み

### Xcodeでの手動セットアップ（`ios/`はgitignore対象なので毎回必要）

1. `native-ios/VoiceInputPlugin.swift`/`.m`を`ios/App/App/`に追加（Target Membership: App）
2. `native-ios/BridgeViewController.swift`の`capacitorDidLoad()`に`bridge?.registerPluginInstance(VoiceInputPlugin())`があることを確認（無ければ追記。既存の`ios/App/App/BridgeViewController.swift`は`git pull`で自動反映されないので**Xcode上で直接編集**）
3. `native-ios/VoiceInputInfo.plist.snippet.xml`の内容を`ios/App/App/Info.plist`の`<dict>`直下に追加する（`NSMicrophoneUsageDescription`・`NSSpeechRecognitionUsageDescription`。これが無いと審査でリジェクトされる）
4. App Group・Background Modes等の追加設定は不要（フォアグラウンドでの一時的な録音のみのため）
5. **`checkPermissions`/`requestPermissions`という関数名を使う時は要注意:** `CAPPlugin`基底クラスにすでに同名の`open`メソッドが定義されているため、`override`を付けず・可視性を`public`にしないままだと「Overriding declaration requires an 'override'」「Overriding instance method must be as accessible as its enclosing type」でビルドエラーになる（実際に発生した不具合）。`@objc public override func requestPermissions(_ call: CAPPluginCall)`のように書くこと
6. ウィジェット連携ぶんの追加セットアップ: `native-ios/Widgets/BrainBoxWidgets.swift`・`Localizable.xcstrings`は新規ファイルではなく**既存ファイルの更新**なので、Widget Extensionターゲット内の同名ファイルの中身をこの変更後の内容に差し替える（ホーム画面ウィジェットの節にある既存の手順と同じ、Widget Extensionターゲット側のみでよくメインAppターゲットの変更は不要）

### Android実装（`native-android/VoiceInputPlugin.kt`）

プラグイン名を`VoiceInputPlugin`で揃えているため`VoiceInput.ts`は無改修で動く。**ウィジェット連携（「音声でタスク追加」ウィジェット）はAndroidにWidget機能自体が未移植のため対象外**——`TaskModal`のマイクボタン・`VoiceCapturePopup`から呼ばれるプラグイン本体のみ移植した。

- `android.speech.SpeechRecognizer`（`RecognitionListener`実装）を使用。iOS版が`AVAudioEngine`のタップから生の音声バッファを自前処理して部分認識結果・RMS音量・無音判定まで全て手動実装しているのに対し、AndroidのSpeechRecognizerは`onPartialResults`（部分認識結果）・`onRmsChanged`（音量）・`onError`をOS側が既に提供するため、iOS版より薄い実装で済む
- **無音自動終了の判定はOS標準の`EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS`等のヒントに任せず、iOS版と同じく独自タイマーで実装している。** これらのextraは端末・認識サービス（メーカーによってGoogle以外の音声認識サービスが既定の場合がある）によって挙動が揺れるヒントに過ぎないため、`onPartialResults`が届くたびに`Handler.postDelayed(1300ms)`のタイマーを張り直す方式に統一し、無音判定のタイミングをiOS版と揃えている
- `onRmsChanged(rmsdB)`は`levelNotifyInterval=80ms`で間引きつつ、iOS版と同じ「直近の最大音量（緩やかに減衰するpeakLevel）を基準にした相対値」で0〜1に正規化する（Androidの`rmsdB`は絶対的なdB SPL値ではなく認識サービス依存の相対値のため、固定閾値ではなくiOS版と同じ相対正規化方式を踏襲した）
- **Androidには「音声認識」専用の許可ダイアログが無い**（マイク権限のみで、認識自体はGoogleアプリ等の認識サービスをintent経由で呼び出す仕組みのため）。iOS版の`speechRecognition`許可状態に相当する値は、代わりに`SpeechRecognizer.isRecognitionAvailable(context)`（端末に認識サービスが入っているか）で判定し、JS側の`VoiceInputPermissionStatus`の形（`{microphone,speechRecognition}`）はそのまま維持している
- `stop()`（手動での早期終了）は`speechRecognizer.stopListening()`を呼ぶだけ。これはここまでの音声で認識を確定させ、OS側が`onResults`を呼び戻す仕組みのため、**iOS版が気をつけていた「`cancel()`で打ち切ると短い発話でテキストが空になる」不具合の心配がそもそも無い**（`stopListening()`と`cancel()`は別物で、`cancel()`の方はiOS版の`recognitionTask.cancel()`相当の即時破棄）
- `SpeechRecognizer`はメインスレッド（Looperを持つスレッド）で生成・操作する必要があるため、`start`/`stop`の`@PluginMethod`本体は`Handler(Looper.getMainLooper()).post{}`でラップしている（Capacitorのプラグインメソッドはデフォルトでバックグラウンドスレッドプールから呼ばれるため）
- `AndroidManifest.xml`に`RECORD_AUDIO`権限に加え、Android 11+のパッケージ可視性制限に対応する`<queries><intent><action android:name="android.speech.RecognitionService"/></intent></queries>`が必要（無いと端末に認識サービスが入っていても`isRecognitionAvailable()`が誤って`false`を返すことがある）

### Android Studioでの手動セットアップ（`android/`はgitignore対象なので毎回必要）

1. `native-android/VoiceInputPlugin.kt`を`android/app/src/main/java/jp/brainbox/app/`にコピー
2. `native-android/MainActivity.java`の内容で既存の`MainActivity.java`を上書きする（`registerPlugin(VoiceInputPlugin.class)`の行が追加されている）
3. `native-android/VoiceInputManifest.snippet.xml`の内容を`android/app/src/main/AndroidManifest.xml`に追加（`<uses-permission>`は`<manifest>`直下の既存の並びに、`<queries>`は`<manifest>`直下・`<application>`と同じ階層に追加）
4. Android Studioで「Sync Now」→ビルドが通ることを確認する
5. 実機/エミュレータでタスク作成画面のマイクボタンをタップし、マイク許可ダイアログ→発話→認識結果がタスク名欄に反映されることを確認する（エミュレータは仮想マイクのため実際の音声認識までは確認できないことがある。実機推奨）
6. これらのファイルを編集した場合、`android/`内の既存ファイルは`git pull`しても自動更新されない（`native-android/`の最新内容を都度コピーし直すこと。他プラグインの節と同じ注意事項）

### 避けるパターン

- `stop()`内で`endAudio()`の直後に`recognitionTask.cancel()`しない（`isFinal`な結果や無音タイマーによる`finishRecognition()`を待たずに打ち切ると、特に短い発話でテキストが空になる不具合の実績あり）
- 無音自動終了のタイマーをリセットするタイミングを部分認識結果のコールバック以外に置かない（音声バッファのコールバック等、実際に音声が認識されたことを示さないタイミングでリセットすると、しゃべっている最中に誤って自動終了してしまう）
- `TaskModal`側で`autoIcon`のような可変stateを、空配列depsの`useEffect`内クロージャから直接参照しない（stale closureになる。`autoIconRef`のような参照経由で最新値を読むこと）
- ウィジェットからの音声入力起動を、新しいCapacitorプラグインやApp Group経由のpendingフラグ・AppIntentを新設して作らない（実際には既存の`AddLaterWidget`と同じ`brainbox://`URLスキーム＋`appUrlOpen`リスナーの仕組みだけで十分に実現できた。新しい仕組みを増やす前に、まずこの既存パターンで足りないか確認すること）
- `appUrlOpen`リスナーで`addLaterVoice`より先に`addLater`を判定しない（`'addLaterVoice'.includes('addLater')`が真になるため、判定順を逆にすると`addLaterVoice`が常に通常の`addLater`分岐に吸われてしまう）
- URLスキーム起動の処理を`appUrlOpen`のライブリスナーだけに頼らない（コールドスタートだとリスナー登録前にイベントが発火して取りこぼされることがある。`CapApp.getLaunchUrl()`も合わせて呼ぶこと）
- PROゲートを`isPremium`チェック無しで素通りさせない（PRO比較表（`sub==='pro'`）にも`proFeatureVoiceInput`の行を追加済み）。**`TaskModal`のマイクボタン（`toggleVoiceInput`内の`!isPremium`チェック→`ProGateSheet`）と`VoiceCapturePopup`（独自の`!isPremium`チェック→`onProPrompt`で設定画面へ）はゲートの実装が別々にある点に注意**——`VoiceCapturePopup`は`TaskModal`を介さない独立コンポーネントのため、`toggleVoiceInput`のチェックは効かない。音声入力の起動経路を新しく増やす時は、その経路自身で`isPremium`を確認すること
- `VoiceCapturePopup`を`TaskModal`の`toggleVoiceInput`と無理に共通化しない（「タップで開始・タップで停止」のトグルと「マウントで自動開始・結果が届いたら自動的に閉じる」は起動条件が異なるため、意図的に別々のコードのまま書いてある）
- `notifyListeners("audioLevel", ...)`の継続配信を「ライブストリーミングは禁止」というルール（`recognitionFinished`の節を参照）と混同して削除しない。**禁止されているのはテキスト（部分認識結果）の逐次配信であり、音量レベルの逐次配信は波形表示のために意図的に導入した別の仕組み**（`levelNotifyInterval=0.08秒`で間引き済み）
- Android側で無音自動終了を`EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS`等のOS標準ヒントだけに任せない（端末・認識サービスによって挙動が揺れるため、iOS版と同じ`onPartialResults`起点の独自タイマー方式を維持すること）
- Android側の`SpeechRecognizer`を`Handler.postDelayed`でメインスレッド以外から生成・操作しない（Looperを持つスレッドでの実行が必須。プラグインメソッドはデフォルトでバックグラウンドスレッドから呼ばれるため`mainHandler.post{}`でラップする）

---

## Apple Watch版（音声で「あとでやる」に追加、v1スコープ限定）

BrainBoxのApple Watch対応。**v1は「マイクボタンを押す→話す→文字起こし→そのまま『あとでやる』に追加」の1機能のみに絞る。** 日時設定・所要時間設定・タイムライン表示・買い物リスト等は一切持たない。「思いついた瞬間に、とりあえず頭の外に出す」ことに特化させる方針。

### アーキテクチャ（Watch AppはCapacitor/WKWebViewとは別物のネイティブSwiftUIアプリ）

BrainBox本体（iOS/Android）はCapacitorでWebコンテンツをラップしたアプリだが、**watchOSはWKWebViewに相当するもの自体が無く、Web技術でWatch Appを作ることはできない。** そのため、Watch Appは`native-ios/Watch/`配下にSwiftUIで書いた完全に独立したネイティブアプリとして実装し、iPhone本体アプリとは`WatchConnectivity`（`WCSession`）でテキストだけをやり取りする。

```
Apple Watch（BrainBox Watch App、native-ios/Watch/）
  ContentView.swift  … マイクボタン＋状態表示のみのUI
  WatchConnector.swift … WCSession経由でiPhoneにテキストを送るだけの薄いラッパー
  BrainBoxWatchApp.swift … @main エントリーポイント
        ↓ WCSession（sendMessage / transferUserInfo）
iPhone（メインAppターゲット、native-ios/）
  WatchBridgePlugin.swift/.m … WCSessionDelegate。受け取ったテキストをUserDefaultsの
        キューに貯めるだけ（他の「保留アクション」系と同じ設計、後述）
        ↓ ポーリング
src/app/components/WatchBridge.ts … getPendingWatchTasks()
src/app/page.tsx（Appコンポーネント） … applyPending()内で読み出し、「あとでやる」タスクとして追加
```

**バックエンド（Vercel）は一切関与しない。** BrainBoxはもともとサーバーDBを持たずlocalStorage完結のアプリなので、Watch→iPhoneの経路もWatchConnectivityのみで完結させ、新しいAPIエンドポイントやVercelプロジェクトの追加は行わない（ユーザーの想定通り）。

### タップ完了機能等と同じ「保留アクション」設計を踏襲（重要）

**WCSessionのメッセージ受信はiPhoneアプリがバックグラウンド/未起動でもOSがアプリプロセスを起こして呼ばれることがあるが、その時点でCapacitorのWebView（JS実行環境）がまだ読み込まれていない可能性があるため、その場で`notifyListeners`を呼んでJSに直接イベント配信する設計は選ばなかった。** 代わりに、`WidgetDataPlugin.getPendingWidgetActions()`・`GeofencePlugin.getPendingGeofenceAction()`と全く同じ「ネイティブは受け取って`UserDefaults`のキューに貯めるだけ、実際の反映はJSがフォアグラウンド復帰時にポーリングして読みに来る」という設計に統一した。

- `native-ios/WatchBridgePlugin.swift`/`.m` — `load()`で`WCSession.default`に自身をdelegateとして設定し`activate()`する（`GeofencePlugin`等と同じく`AppDelegate.swift`は編集しない）。`session(_:didReceiveMessage:)`（Watch側がreachableな時の即時経路）・`session(_:didReceiveUserInfo:)`（reachableでない時のキュー配信経路）の両方から届いたテキストを`UserDefaults`の`pendingWatchTaskTexts`（文字列配列）に追記する。`getPendingWatchTasks()`がこの配列を読み取って返し、読み取り後は削除する
- `src/app/components/WatchBridge.ts` — `getPendingWatchTasks(): Promise<string[]>`（Web/開発環境は常に空配列）
- `src/app/page.tsx`の`App`コンポーネント、既存の`applyPending()`（`getPendingWidgetActions`/`getPendingGeofenceAction`/`getFiredTaskLocationIds`と同じ、起動時＋`visibilitychange`で呼ばれる関数）の中に追記する形で`getPendingWatchTasks()`を呼び、返ってきた各テキストを「あとでやる」タスクとして`setTasks`に追加する
- **`addVoiceLaterTask(text)`（ウィジェット版音声入力が使う既存関数）をそのまま呼ばない。** `addVoiceLaterTask`は`date`（現在タイムラインで表示中の日付）state を参照するが、`applyPending()`のuseEffectは`deps=[loaded]`（実質マウント時に1回だけ効果本体が作られる）ため、その中で`date`を直接参照すると値が固定されたまま古くなる**stale closure**になる（`TaskModal`の`autoIcon`を`autoIconRef`経由で読む既存の罠と全く同じパターン）。回避策として、`addVoiceLaterTask`を経由せず、`date`に依存しない`todayStr()`を使ってタスクオブジェクトをその場で組み立てて`setTasks`する（Watchでの追加はタイムラインの表示状態と無関係に「今日」として記録するのが意味的にも正しい）

### iPhone側の受け口（WatchConnectivity）

- `session(_:didReceiveMessage:)`と`session(_:didReceiveUserInfo:)`の使い分け: Watch側の`WatchConnector.send()`が`session.isReachable`なら`sendMessage`（即時配信、`replyHandler`は待たない=fire-and-forget）、そうでなければ`transferUserInfo`（キュー配信、いつかiPhoneが近くに来た時に届く）を使う。BrainBoxは「あとでやる」タスクを1件ずつ独立して送るだけなので、往復確認（reply）は不要と判断した
- `sessionDidBecomeInactive`/`sessionDidDeactivate`はiOS側のみ実装が必須（watchOS側の`WCSessionDelegate`には存在しない、複数Watchペアリング対応のためのiOS固有要件）。`sessionDidDeactivate`では`WCSession.default.activate()`を再度呼ぶ（Appleの定型実装）

### Watch側のUI・音声入力（`presentTextInputController`、0.4秒遅延での自動開始）

**watchOS版はiOS版VoiceInputPlugin（`SFSpeechRecognizer`＋`AVAudioEngine`の自前実装、マイク権限リクエストあり）を移植しない**（`SFSpeechRecognizer`/`Speech`フレームワーク自体がwatchOS単体アプリには提供されておらず、技術的に不可能——過去に自前実装を試みて実機ビルドが失敗し、revertした実績がある。新しいセッションでこの自前実装を再び試みないこと）。代わりにWatchKitの`WKInterfaceController.presentTextInputController(withSuggestions:allowedInputMode:completion:)`を`allowedInputMode: .plain`で呼ぶと、システム標準の入力選択画面（ダイクテーション/Scribble/定型リスト）が開き、ダイクテーションを選んで話し終えると自動でテキスト化されて返ってくる（`.forceDictation`というケースは実在せず、候補チップ/Scribble選択を完全にスキップする手段は無い。話し終えた後も「完了」をタップして確定する必要がある——これはOS標準の仕様でアプリ側からは変更できない）。**音声キャプチャ・認識はシステムのプロセスが行うため、アプリ側で`NSMicrophoneUsageDescription`/`NSSpeechRecognitionUsageDescription`をWatch App側のInfo.plistに追加する必要が無い**（iOS版のVoiceInputPluginが自前でマイクを掴む方式との大きな違い）。

- **【実機検証済み】アプリを開いた瞬間（`.onAppear`）の即時自動ダイクテーション開始は失敗する。** `WKExtension.shared().visibleInterfaceController`はSwiftUI Onlyの`App`ライフサイクルでも解決できる設計のはずだったが、実機（watchOS 26.6）で検証したところ`.onAppear`発火と同時に即座に呼ぶと`nil`を返すことが判明した（`WKHostingController`のアタッチが`.onAppear`発火時点ではまだ間に合っていないためと考えられる）。常にフォールバックのTextFieldに落ち、かつマイクボタンとTextFieldが同時に表示される分かりにくい画面になっていた。**一度はタップ起点のみに撤回したが、「開いたらすぐ音声入力したい」という要望により、`.onAppear`から0.4秒遅延させてから`startDictation()`を呼ぶ方式で再挑戦した**（`didAutoStart`フラグで1回限りに制限）。`idle`画面は常にマイクボタンを表示しており、自動開始・タップ起点のリトライのどちらでも同じ`startDictation()`を使う。呼んだ結果`visibleInterfaceController`がまだ`nil`だった場合にのみ、マイクボタンをフォールバックの`TextField`に差し替える（`@FocusState`で自動フォーカスし、タップなしでキーボード/ダイクテーション選択肢が開くようにしてある。ボタンとTextFieldを同時には出さない）。**この0.4秒遅延方式はまだ実機未検証——次回セッションで確認し、もし依然として`nil`に落ちるようなら遅延を伸ばすか、タップ起点のみに戻すことを検討すること。**
- フロー: `idle`（マイクボタン。`.onAppear`から0.4秒後に自動でダイクテーション開始、またはタップで開始）→`dictating`（システムのダイクテーション画面、アプリ側では何も描画しない）→`preview`（認識結果を0.8秒だけプレビュー表示、iOS版`VoiceCapturePopup`と同じ「結果が見える間を持たせる」設計を踏襲）→`sending`→`done`（「追加しました」）/`error`（「送信できませんでした」）→1.6秒後に自動的に`idle`へ戻る
- **送信の成否判定は「配信されたか」ではなく「送信呼び出し自体が成功したか」で行う。** `transferUserInfo`はローカルでのキューイングにほぼ確実に成功し、実際の配信（iPhoneに実際に届くタイミング）は非同期・不確定だが、BrainBoxは「まず記録できたら安心させる」思想のアプリ（買い物リストの場所通知等と同じ「通知を減らすより思い出すきっかけ・記録の安心感を優先する」方針）のため、配信の遅延をユーザーに気にさせない楽観的なUIにしている

### Xcodeでの手動セットアップ（`ios/`はgitignore対象・新規Watch Appターゲットなので毎回必要）

**① Watch Appターゲットを新規作成**

1. Xcodeメニュー File → New → Target → 「Watch App」を選択（Companion App: 既存の`App`ターゲットを選ぶ。単体のwatchOSアプリ用テンプレートではなく、必ずiOSアプリに紐づく「Watch App」を選ぶこと）
2. Product Name: `BrainBox Watch App`（任意）。"Include Notification Scene"はオフでよい
3. 作成すると自動生成される雛形の`ContentView.swift`/`BrainBoxWatchAppApp.swift`（サンプルコード）は削除する
4. `native-ios/Watch/BrainBoxWatchApp.swift`・`ContentView.swift`・`WatchConnector.swift`をこの**Watch Appターゲット**に追加（Target Membership: BrainBox Watch App。メインAppターゲットには入れない）
5. WatchConnectivityは特別なCapability追加不要（`import WatchConnectivity`だけで使える。App GroupやBackground Modesの追加設定は不要）

**② WatchBridgePlugin を追加（メインAppターゲット、他のCapacitorプラグインと同じ手順）**

1. `native-ios/WatchBridgePlugin.swift`/`.m`を`ios/App/App/`に追加（Target Membership: App）
2. `native-ios/BridgeViewController.swift`の`capacitorDidLoad()`に`bridge?.registerPluginInstance(WatchBridgePlugin())`があることを確認（無ければ追記。既存の`ios/App/App/BridgeViewController.swift`は`git pull`で自動反映されないので**Xcode上で直接編集**）。**過去にこの2.の登録行だけが抜けたまま気づかず、「Watch側から送信しても『あとでやる』に一切反映されない」不具合を実機まで気づけなかった実績がある。** ファイル自体（1.）がXcodeプロジェクトに追加されていても、このregisterPluginInstanceの行が無いと`WCSessionDelegate`が設定されず何も受信できない。ファイルを追加しただけで満足せず、必ずこの行の存在を確認すること

**③ ビルド・実機確認**

1. `BrainBox Watch App`スキームを選び、ペアリング済みのApple Watch実機（またはWatchシミュレータ）にビルド・実行
2. マイクボタンをタップ→ダイクテーション画面が開くことを確認→適当に話す→「追加しました」が表示されることを確認
3. iPhone側でBrainBoxアプリを開き（またはフォアグラウンドに戻し）、「あとでやる」一覧に音声で話した内容がタスクとして追加されていることを確認（Watch側がreachableだった場合は数秒以内、そうでない場合はiPhoneが近くに来てから）

### Watch文字盤のコンプリケーション（`WatchComplication.swift`、「BB」ロゴマークのテンプレート画像）

Apple Watchの文字盤に表示する小さいアイコン（コンプリケーション）。タップすると`BrainBox Watch App`が起動し、`ContentView.swift`の0.4秒遅延自動開始ロジックによってそのままダイクテーションが始まる。

**iPhone側のロック画面ウィジェット（`BrainBoxWidgets.swift`の`AddLaterVoiceLockScreenWidget`）とは完全に別物。** 文字盤コンプリケーションは**Watch App自身に埋め込まれた専用のWidget Extension**でしか提供できず、iPhone側のWidget Extension（`BrainBoxWidgetsExtension`）を共有・流用することはできない。新しいセッションでこの2つを混同しないこと——「ロック画面ウィジェットを作ったのに文字盤のコンプリケーション一覧に出てこない」という形で過去に実際に混同が発生した。

- `native-ios/Watch/WatchComplication.swift` — `WatchComplicationView`は`@Environment(\.widgetFamily)`で全ファミリー（`.accessoryCircular`/`.accessoryCorner`/`.accessoryRectangular`/`.accessoryInline`）とも「BB」ロゴマーク画像のみを表示する（テキストラベルは一切付けない。アイコンだけのシンプルな見た目にしたいというフィードバックを受けた設計）
- タップ時のdeep link処理は一切不要（WidgetKitのwidgetはLink/URLが無くてもタップで単純にアプリを起動する標準動作のため）。`ContentView.swift`の既存の自動開始ロジックにそのまま乗る
- データの同期（App Group等）は不要——常に同じ見た目を表示するだけなので`TimelineProvider`は固定の1エントリ・`policy: .never`で完結する

**ロゴ画像の実装経緯（重要）:** 当初は汎用の`mic.fill`（SF Symbols）だったが、ユーザーから「BBのアイコンにできないか」と要望を受けた。フルカラーのアプリアイコンPNG（`native-ios/icons/AppIcon-*.png`、背景色付きの正方形）をそのまま使わなかった理由は、**accessory系ウィジェットファミリー（文字盤コンプリケーション・ロック画面ウィジェット共通）はシステムが文字盤ごとに強制的にモノクロ/アクセントカラーでレンダリングすることが多く、そのレンダリングは画像のアルファチャンネルだけを形状として使う**（iPhoneのロック画面ウィジェットの節にある既知の制約と同じ）ため。背景まで不透明なフルカラーPNGをそのまま使うと、文字盤によっては形が失われて単なる塗りつぶしの丸/四角になってしまう。一度は`Text("BB")`で妥協したが、「文字っぽくて微妙、アイコンそのままがいい」というフィードバックを受け、**`native-ios/icons/AppIcon-Mint.png`から「BB」の文字部分だけをアルファ抜き（背景のミント色を透明化、白文字だけを不透明として残す）したテンプレート画像`native-ios/icons/BBMark-Template.png`を新規生成し、それを使う方式に変更した。** コードでは`Image("BBMark").renderingMode(.template)`で明示的にテンプレート画像として扱い、`.widgetAccentable()`を付けることで、どの文字盤でも実際のロゴの形のまま正しくモノクロ/アクセントカラー表示される（白一色のテンプレート画像のため、フルカラー対応の文字盤でも「白いBBマーク」として表示され、色が崩れることはない）。

**色をアプリのデフォルトテーマカラー（mint）に固定できないか、という要望にも対応済み（ただし一部の文字盤限定）。** `WatchComplicationView`は`@Environment(\.widgetRenderingMode)`で現在のレンダリングモードを判定し、`.fullColor`（フルカラー表示に対応した一部の文字盤）の時だけ`.foregroundStyle(Color(red:148/255,green:207/255,blue:200/255))`（`#94CFC8`、THEMESの`mint`と同じ値）で固定表示する。**`.accented`/`.vibrant`（大半の文字盤はこちら）では`.widgetAccentable()`を付けてシステムに着色を委ねており、アプリ側から色を強制することはできない**——これはAppleの仕様上「その文字盤の配色に全コンプリケーションを統一させる」ための意図的な制約で、回避策は無い。**新しいセッションで「ミント固定にできないか」という要望が再度来ても、`.accented`/`.vibrant`モードの文字盤については技術的に不可能であることを説明すること**（できるのは`.fullColor`モードの文字盤限定で、それはすでに対応済み）。

**Xcodeでの手動セットアップ（`ios/`はgitignore対象・新規Widget Extensionターゲットなので毎回必要）:**

1. Xcodeメニュー File → New → Target → 「Widget Extension」を選択。**Embed in Application（埋め込み先）は必ず`BrainBox Watch App`を選ぶこと**（デフォルトでメインの`App`が選ばれていないか確認。iPhone側に埋め込むと文字盤コンプリケーションとして機能しない）
2. Product Name: `BrainBoxWatchComplication`（任意）。"Include Live Activity"・"Include Configuration App Intent"・"Include Control"は**オフ**
3. 作成すると自動生成される雛形の`.swift`ファイル（サンプルWidgetコード）は削除する
4. `native-ios/Watch/WatchComplication.swift`をこの**新規Widget Extensionターゲット**に追加（Target Membership: 作成したこのターゲットのみ。`BrainBox Watch App`本体にもiPhone側の`App`にも追加しない）
5. **この新規Widget Extensionターゲットの`Assets.xcassets`（ターゲット作成時に自動生成される）に`native-ios/icons/BBMark-Template.png`を画像セットとして追加する**（Xcodeの`Assets.xcassets`を開き、右クリック→「New Image Set」→名前を`BBMark`に変更→画像ファイルを1x枠にドラッグ＆ドロップ。Attributes Inspectorで「Scales」を「Single Scale」にすると1枠で済む。「Render As」を「Template Image」にしておくとプレビューが分かりやすいが、コード側で`.renderingMode(.template)`を明示しているため必須ではない）。**画像セット名は必ず`BBMark`にすること**（`WatchComplicationView`の`Image("BBMark")`と一致させる必要がある）
6. Minimum Deploymentを**watchOS 9.0以上**に設定する（`.accessoryCircular`等のaccessory系ウィジェットファミリーがwatchOS 9+のAPIのため）
7. App Group・Info.plistの追加設定は不要（静的な見た目のみで共有データを持たないため）
8. `BrainBox Watch App`スキームでビルド・実行（Widget Extensionは自動的に埋め込まれる）
9. 実機のApple Watchで文字盤を長押し →「編集」→ コンプリケーションの追加 →「BrainBox」を検索して配置する（または、iPhone側の「Watch」アプリ →「マイウォッチ」→ 文字盤を選択 →「コンプリケーション」から追加。今回の操作で確認した画面はこちら）
10. コンプリケーションをタップ→アプリが起動し、0.4秒後に自動でダイクテーションが始まることを確認する

### Android版（Wear OS）は現時点で未対応

Wear OSはApple WatchのWatchConnectivityとは全く異なる仕組み（Google Play services の Wearable Data Layer API等）が必要で、今回のスコープには含めていない。将来Wear OS対応を検討する場合、`native-android/`配下に別途新しいモジュール構成が必要になる点に注意すること（iOS版の`native-ios/Watch/`をそのまま流用できない）。

### 避けるパターン

- Watch Appターゲットに`native-ios/`直下のiPhone用ファイル（`WatchBridgePlugin.swift`等）を追加しない（Target Membershipを間違えるとビルドできない、または意図しない重複シンボルになる）
- 新しいCapacitorプラグインファイルを`native-ios/`に追加した時、`BridgeViewController.swift`への`registerPluginInstance`登録を忘れない（ファイルをXcodeに追加しただけでは動かない。`WatchBridgePlugin`でこの登録漏れが実機不具合として発生した実績がある）
- Apple Watchの「文字盤コンプリケーション」（`WatchComplication.swift`、Watch App自身に埋め込むWidget Extension）とiPhoneの「ロック画面ウィジェット」（`BrainBoxWidgets.swift`の`AddLaterVoiceLockScreenWidget`、iPhone側のWidget Extensionに埋め込む）を混同しない。別物のXcodeターゲットで、どちらかを作ってももう片方には出てこない
- watchOS側で`SFSpeechRecognizer`/`AVAudioEngine`を自前実装しようとしない（`Speech`フレームワーク自体がwatchOS単体アプリに存在せず技術的に不可能。過去に試みて実機ビルドが失敗しrevertした実績がある。`presentTextInputController(allowedInputMode: .plain)`で十分——マイク権限のInfo.plist設定も不要になる。iOS版VoiceInputPluginの設計をそのまま移植しようとしないこと）
- 文字盤コンプリケーションにフルカラーのアプリアイコンPNG（`AppIcon-*.png`）をそのまま`Image("...")`で使わない（accessory系ファミリーは文字盤ごとにモノクロ/アクセントカラーでレンダリングされ、不透明な背景込みの画像は形が失われて塗りつぶしの丸/四角になる。`native-ios/icons/BBMark-Template.png`のような、アルファ抜きした透明背景のテンプレート画像＋`.renderingMode(.template)`を使うこと）
- `ContentView.swift`の`.onAppear`で即座に（遅延なしで）`startDictation()`を呼ばない（実機検証済みの不具合：`WKExtension.shared().visibleInterfaceController`が`.onAppear`発火と同時だと`nil`を返し、常にフォールバックTextFieldに落ちる。現在は0.4秒遅延させてから自動開始する方式——`didAutoStart`フラグで1回限り。この遅延方式もまだ実機未検証なので、同じ不具合が再発したら遅延を伸ばすかタップ起点に戻すことを検討する）
- `WatchBridgePlugin`の受信処理から`notifyListeners`でJSにライブ配信しようとしない（バックグラウンド/未起動時にWebViewが読み込まれていない可能性があるため。他の「保留アクション」系と同じポーリング方式に統一すること）
- `applyPending()`内でWatch由来のタスクを追加する時に`addVoiceLaterTask(text)`をそのまま呼ばない（`date`を参照するため、`deps=[loaded]`のuseEffect内ではstale closureになる。`todayStr()`を使ってタスクオブジェクトをその場で組み立てること）
- Watch→iPhoneの送信に`sendMessage`の`replyHandler`での往復確認を必須にしない（「あとでやる」への追加は片道の記録で十分。往復待ちを入れるとreachableでない時に機能全体が動かなくなる）
- 新しいバックエンドAPI・Vercelプロジェクトを追加しない（WatchConnectivityのみで完結させる設計。サーバーDBを持たないBrainBoxの既存方針と一貫させる）

---

## 放置タスク通知・アプリ起動リマインダー（設定 → 通知 → 放置タスク）

`sub==='notifications-later'` 画面（`SettingsScreen`）に2つの独立したリマインダー設定がある。

### 放置タスク通知（既存機能・一部PRO化済み）

`Settings.laterReminderHours`（`LATER_REMINDER_OPTS`: オフ/1時間/3時間/6時間/12時間/1日/2日/3日）。**「オフ」と「3日」のみ無料。それ以外（1時間〜2日）はPRO。** 非PROで選ぶと `setProPrompt('タスク放置アラートの間隔変更')` で `ProGateSheet` を表示し、選択中のボタンに `AppIcons.lock`（小さい鍵アイコン、テキストの左）を表示する。タスク実行判定自体は既存のJS側 `useEffect`（`now` ベースのポーリング、フォアグラウンド時のみ動作）。**就寝〜起床の時間帯（`inSleepWindow()`）は通知しない**（判定タイミングがたまたま就寝時間中だった場合はスキップされ、次に起きている時間帯にポーリングが走った時に改めて判定される）。

### アプリ起動リマインダー（一部PRO化済み）

`Settings.appInactivityHours`（`APP_INACTIVITY_OPTS`: オフ/6時間/12時間/1日/2日/3日、デフォルト6時間）。「一定時間アプリを開いていない場合に通知する」機能。**放置タスク通知とは独立した別機能**（あとでやるタスクの有無に関係なく、単純にアプリを開いた/開いていない時間で判定）。**「オフ」とデフォルト値の「6時間」のみ無料。それ以外（12時間〜3日）はPRO。** 非PROで選ぶと `setProPrompt('アプリ放置アラートの間隔変更')` で `ProGateSheet` を表示し、選択中のボタンに `AppIcons.lock` を表示する（放置タスク通知と同じパターン）。

タスクリマインダーと違い、アプリがバックグラウンド/未起動でも数時間〜数日後に発火する必要があるため、JSのタイマーでは実現できない（プロセスが生きている保証がない）。iOSネイティブの `UNTimeIntervalNotificationTrigger` で完結させる。

**就寝時間帯を避ける調整（起床時刻から改めてカウントし直す）:** バックグラウンドに移る瞬間（`document.visibilitychange`）に基準となる発火予定時刻を `Date.now()+hours*3600*1000` で計算し、共通ヘルパー`adjustFireForSleep(fireMs, hours, wakeTime, sleepTime)`（放置タスク通知と共通）に渡す。就寝時間帯に重なる場合、**単に起床時刻ちょうどに前倒しするのではなく**、起床時刻を起点として改めて `hours` 時間分カウントし直した時刻（起床時刻+`hours`時間）を基準発火時刻にする（就寝中はカウントが止まっているイメージ）。これは「起床直後に間髪入れず『しばらく開いていません』通知が来る」「朝イチの起床チェックイン通知と同時刻に重なる」という2つの不具合を避けるための仕様。再通知（`STALE_REPEAT_HOURS`ごと）はこの基準発火時刻からの固定間隔で予約するのみで、個々の再通知はそれぞれ`adjustFireForSleep`で再調整しない（`nowMs+hours*STALE_REPEAT_HOURS...`のように毎回`nowMs`から再計算しない。そうすると基準時刻の調整前後で再通知の順序が逆転し得るため）。ネイティブ側の `UNTimeIntervalNotificationTrigger` は相対時間しか扱えないため、時刻の調整はJS側で行う。

**未解決なら再通知する（`STALE_REPEAT_HOURS`/`STALE_MAX_REPEATS`、放置タスク通知と共通の定数）:** アプリが開かれないままだと、最初の通知（起床時刻を考慮して調整済みの基準時刻）に加えて `STALE_REPEAT_HOURS`（6時間）おきに最大 `STALE_MAX_REPEATS`（5回）ぶんの通知をまとめて事前予約する。`scheduleInactivityReminder()` には単一の`hours`ではなく、この一連の時間数（`hoursList: number[]`）を渡す。アプリを開けば`cancelInactivityReminder()`で全件まとめて取り消される。

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

### Android実装（`native-android/InactivityPlugin.kt`）

プラグイン名を`InactivityPlugin`で揃えているため`Inactivity.ts`は無改修で動く。`AlarmManager`で`app-inactivity-reminder-${index}`を予約する設計はiOSと同じで、通知の発火自体は既存の`LocalNotifyReceiver.kt`をそのまま再利用する（新しいBroadcastReceiverは追加不要。extraのid/title/body/openShopを渡すだけで届く）。

**この移植だけは`GeofencePlugin`のようなSharedPreferencesでの登録済みIDブックキーピングが不要。** `LocalNotifyPlugin`のアラートは`task-alert-${taskId}-...`のようにIDがタスク数に応じて可変だが、`InactivityPlugin`の識別子は`hoursList`配列のインデックスのみで、`hoursList`の長さは`STALE_MAX_REPEATS+1`件程度で常に小さく上限が決まっている。存在しない`PendingIntent`を`cancel()`しても何も起きないため、`scheduleReminder`/`cancelReminder`とも毎回`0〜MAX_REMINDERS(=20)`を無条件にcancelするだけで「全解除」を実現している。新しく似たような固定件数・インデックスベースの予約を追加する時はこの簡略パターンが使えないか検討すること（可変IDの場合は`GeofencePlugin`/`LocalNotifyPlugin`と同じSharedPreferencesブックキーピングが必要）。

通知許可の確認は`NotificationManagerCompat.from(context).areNotificationsEnabled()`で行う（iOSの`getNotificationSettings`と同じく、許可をリクエストせず現在の状態を見るだけ。オンボーディングの通知プロンプトより前に勝手にOSダイアログを出さないための設計はiOS版と同じ理由）。

**Android Studioでの手動セットアップ:** `native-android/InactivityPlugin.kt`を`android/app/src/main/java/jp/brainbox/app/`にコピーし、`native-android/MainActivity.java`の内容で上書きする（`registerPlugin(InactivityPlugin.class)`が追加されている）。Manifest・Gradle依存の追加は不要（`LocalNotifyReceiver`を再利用するため）。

### 避けるパターン

- アプリ起動リマインダーの発火判定をJS側の `setTimeout`/`setInterval` で行おうとしない（アプリがバックグラウンド/未起動になるとタイマーは動かない。必ずネイティブの `UNTimeIntervalNotificationTrigger`（Android版は`AlarmManager`）で完結させる）
- フォアグラウンドに戻った時に `cancelInactivityReminder()` を呼び忘れない（呼ばないと、アプリを頻繁に開いていても毎回のバックグラウンド移行で古いタイマーが残ったまま新しい予約と重複し得る。現状は同一IDで上書きされるため実害は少ないが、意図としては「開いたらリセット」が正しい）
- 放置タスク通知（`laterReminderHours`）とアプリ起動リマインダー（`appInactivityHours`）を同じ設定値として扱わない（別々のフィールド・別々のUI・別々のPRO方針）

---

## 主要な型定義

| 型 | 説明 |
|---|---|
| `Task` | id, name, startTime, duration, memo, icon, completed, date, isLater, recurrence, customRec, pinned, tags, notifications, incompleteReminder, category, postponedCount, color, subtasks, **deadlineAt?:string, deadlineNotify?:'week'\|'3days'\|'dayBefore'\|'sameDay'\|'auto'（PRO）**, **address?:string（表示用住所・全タスクタイプ・無料）**, **locationNotify?:boolean, location?:{name,lat,lng}（場所で通知の対象座標・あとでやる限定・PRO）** |
| `Settings` | wakeTime, sleepTime, **keepIncomplete?:boolean**, **weekStartsOn?:0\|1（0=日曜始まり・デフォルト、1=月曜始まり）**, **fontSize?:'small'\|'standard'\|'large'\|'xlarge'（デフォルト'standard'）** |
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
| `SHOP_NOTIF_KEY` | `'tl-shop-notif-v1'` | 買い物リストの時間指定通知設定 |
| `SHOP_LOC_KEY` | `'tl-shop-loc-v1'` | 買い物リストの場所通知設定（`ShopLocation[]`） |
| `FORGET_ALERTS_KEY` | `'tl-forget-alerts-v1'` | 忘れ物防止アラート設定（`ForgetAlert[]`） |
| `FEATURE_USAGE_KEY` | `'tl-feature-usage-v1'` | 「おすすめ機能」判定用の機能利用履歴（`FeatureUsage`） |
| `RECOMMEND_STATE_KEY` | `'tl-recommend-state-v1'` | 「おすすめ機能」の表示・却下状態（`RecommendationState`） |
| `TOUR_COMPLETED_KEY` | `'tl-product-tour-completed-v1'` | プロダクトツアー完了フラグ |

---

## オンボーディング・おすすめ機能・プロダクトツアー

初回起動時の導線として以下の順で連鎖する: **ウェルカム画面 → プロダクトツアー → 通知プロンプト → 位置情報プロンプト → 起床・就寝プロンプト**。アプリに触る前に許可や設定を求めると離脱されやすいため、まずツアーで実際に触ってもらい、価値が伝わった後に通知・位置情報の許可を求め、起床・就寝設定は最後に回している。「おすすめ機能」はこれらとは独立して、インストール後しばらく経ってから条件を満たすたびに表示される。

**旧オンボーディング（説明用のスワイプ式イントロ画面）は廃止済み。** 「読まれにくい」「BrainBoxの価値は説明よりも実際に触ることで伝わる」という理由で削除した（`src/app/components/Onboarding.tsx`・`ONBOARDING_KEY`・`showOnboarding`state・`completeOnboarding()`はすべて削除済み。**この旧スワイプ式イントロは新しいセッションで復活させないこと**）。後述の「ウェルカム画面」（`Welcome.tsx`）はこれとは別物——背景画像1枚＋タイトル・サブタイトル・ボタン2つのみの単一画面で、複数ページを読ませる説明UIではない。

### ウェルカム画面（`src/app/components/Welcome.tsx`）

初回起動時、プロダクトツアーより前に表示する単一画面。背景画像（`public/welcome-bg.png`、ロゴマーク入りのブランドカラー背景）の上に、タイトル「BrainBox」・サブタイトル「頭の中を、もっとシンプルに。」・ボタン2つ（「使い方を見る」「スキップ」）を重ねる。

- 表示文言は`useI18n()`の`tr()`経由で取得する（`src/app/components/I18n.tsx`の`STRINGS`に集約済み。多言語対応の詳細は後述の「多言語対応（i18n）」節を参照）
- 背景画像はロゴマークが画面上部〜中央（縦48%あたりまで）にあるため、タイトル以降のテキストは`height:'48vh'`のスペーサーで画像のロゴと重ならない位置まで下げてから配置している。画像の構図を変える場合はこの値も合わせて調整すること
- タイトル・サブタイトル・ボタン列はそれぞれ`welcomeFadeUp`（`globals.css`、フェード＋下から16px分の移動）を`animationDelay`をずらして適用し、上から順に浮かび上がるフェードイン演出にしている
- 「使い方を見る」ボタンは背景と同系色（ミント）に埋もれないよう**白背景**にしている（`background:'white', color:'var(--c-primary-dark)'`）。テキストのみの「スキップ」と視覚的な重みを差別化する狙いもある
- 「使い方を見る」→`App`側で`setShowWelcome(false)`→`setShowTour(true)`→`product_tour_started`を計測してプロダクトツアーへ
- 「スキップ」→ツアーの「スキップ」ボタンと完全に同じ扱いにする（`TOUR_COMPLETED_KEY`をセットし`product_tour_skipped`を計測、`maybeShowNotifPrompt()`で通知プロンプトへ進む）。**ウェルカム画面・プロダクトツアーとも二度と表示されない**——新しいアテンプト用の別キーは持たず、既存の`TOUR_COMPLETED_KEY`1つだけでウェルカム画面とツアー両方の表示可否を判定する設計（このキーが立っていればウェルカム画面もスキップされ、初回ロードの`useEffect`はそのまま通知プロンプト以降の判定に進む）

### プロダクトツアー → 通知・位置情報プロンプト → 起床・就寝プロンプトの連鎖

初回ロードの`useEffect`は`TOUR_COMPLETED_KEY`が無ければウェルカム画面を表示するところから始まる（これが初回起動時の最初の画面になる）。**`setShowWelcome(true)`は`setLoaded(true)`と同じ効果内で同期的に呼ぶこと（`setTimeout`で遅らせない）。** 過去に`setTimeout(()=>setShowWelcome(true),1000)`としていたことがあり、`loaded`が先に`true`になってからこのタイマーが発火するまでの1秒間、ウェルカム画面より先に（裏にあるはずの）タイムライン本体が一瞬見えてしまう不具合があった。初回起動時はタイムラインに表示すべき既存データが無いため、この一瞬の表示が特に目立って不具合に見える。`loaded`と同時にセットすれば、`読み込み中…`画面から一度のレンダーで直接ウェルカム画面に切り替わり、タイムラインが挟まらない。



`Welcome`の「あとで見る」・`ProductTour`の`onFinish`（どちらも`TOUR_COMPLETED_KEY`をセットする箇所）から`maybeShowNotifPrompt()`を呼ぶ——**ツアーを「スキップ」した場合も「あとで見る」を選んだ場合も同じ連鎖に入る**。ツアーが既に完了しているユーザーの入口である`maybeShowProductTour()`も、`TOUR_COMPLETED_KEY`があれば同様に`maybeShowNotifPrompt()`を呼び、無ければウェルカム画面を表示する。

**通知・位置情報の許可（ツアー完了直後）:** BrainBox独自の説明ポップアップ（`showNotifPrompt`/`showLocPrompt`、旧実装）は撤去済み。**Apple純正の許可ダイアログをそのまま順番に出す**（`maybeShowNotifPrompt()`→`requestNotifyPermission('onboarding')`→（完了後）`maybeShowLocPrompt()`→`ensureGeofencePermission('onboarding')`→（完了後）`maybeShowWakeSleepPrompt()`）。
- `requestNotifyPermission()`/`ensureGeofencePermission()`はどちらもPromiseを返す。`.finally()`で次のステップに繋ぐことで、前のダイアログの選択が終わってから次のダイアログを要求する順序を保証している（同期的に両方叩くと、iOS側のダイアログ表示順が呼び出し順と一致する保証がなくなる）
- `NOTIF_ASKED_KEY`/`LOCATION_ASKED_KEY`は各ステップに入った時点（ダイアログの結果を待たず）で即座にセットする（「一度尋ねたら二度と出さない」管理用。拒否されても再度は聞かない）
- `maybeShowNotifPrompt()`は`settings.notificationsEnabled`をtrueにしてからリクエストする（旧実装の「オンにする」ボタン相当の副作用を維持）
- `maybeShowLocPrompt()`は`LOCATION_ASKED_KEY`が既にあれば`maybeShowWakeSleepPrompt()`を呼ぶ（両ステップとも「既に済んでいれば次へ」を関数内に持つ）

**起床・就寝プロンプト（連鎖の最後）:** `maybeShowWakeSleepPrompt()`は`WAKESLEEP_ASKED_KEY`が既にあれば何もせず終了する（＝この連鎖はここで終わり、次のプロンプトへは繋がらない）。`dismissWakeSleepPrompt()`（`confirmWakeSleepPrompt()`もこれを呼ぶ）は`WAKESLEEP_ASKED_KEY`をセットして閉じるだけで、以降何も呼ばない。

**【重要・実機不具合】上記の連鎖より前に、アプリ起動直後にOSの通知許可ダイアログが勝手に出てしまう不具合があった。** 原因はJS側ではなくネイティブ側（`LocalNotifyPlugin.swift`/`InactivityPlugin.swift`）。`syncWakeCheckins`（起床時チェックイン）等のバックグラウンド事前予約系関数は、デフォルトの起床時刻設定だけで発火条件を満たすため、初回起動直後・ツアーより前に`tasks`/`settings`のuseEffectから呼ばれてしまう。これらネイティブ側の`scheduleAlerts()`/`scheduleReminder()`が`UNUserNotificationCenter.requestAuthorization()`を無条件に呼んでいたため、オンボーディングの「通知プロンプト」（意図的に許可を求めるタイミング）より先にOSダイアログが表示されてしまっていた。**修正: `requestAuthorization`ではなく`getNotificationSettings`で現在の許可状態を確認し、既に許可済みの場合のみ予約する（未確定/拒否なら何もせず静かに終了）よう変更した。** これにより、OSダイアログを実際に出すのは`requestPermission()`経由のオンボーディングフロー（意図的なタイミング）だけになる。新しくバックグラウンド事前予約系のネイティブ関数を追加する時は、`requestAuthorization`を直接呼ばず必ずこのパターン（`getNotificationSettings`で確認してから予約）に倣うこと。

**既存ユーザー（この導線変更前からのユーザー）向けフォールバック:** 初回ロードの`useEffect`は`TOUR_COMPLETED_KEY`→`NOTIF_ASKED_KEY`→`LOCATION_ASKED_KEY`→`WAKESLEEP_ASKED_KEY`の順で「まだ済んでいない最初の段階」を判定し、そこから連鎖を再開する（各段階の関数が「次の段階が済んでいなければ呼ぶ」を内包しているため、この判定は開始地点を決めるだけでよい）。

### プロダクトツアー（`src/app/components/ProductTour.tsx`）

タスク追加→「あとでやる」タブの説明→タスク名を入力→保存→ドラッグ＆ドロップの5ステップのスポットライト型ツアー。`App`の`showTour`がtrueの間、メインUIの上に**オーバーレイ表示**する（実際のUIを隠さず、暗転帯の「穴」から直接操作させる設計。`settingsOpen`/`calendarOpen`/`searchOpen`のいずれかがtrueの間は表示しないが、**`modal.open`中は表示し続ける**——ステップ2〜4でタスクモーダル自体をスポットライトする必要があるため）。

**時間指定（`scheduled`）タスクの作成フローを説明するステップは意図的に持たない。** 過去には「時間指定のタスクはこちらのタブから追加できます。」→タスク名入力→保存→タイムライン確認、という時間指定版のフルフローが存在したが、ツアー全体が長くなりすぎるため撤去し、**「あとでやる」タスクの作成フローのみ**に一本化した。これに伴い、ツアー中のFABタップは常に`openAdd()`（`prefillTime`無し）を呼ぶようになった（以前は`showTour`中だけ`openAdd(nowStr())`を渡し`initMode()`により「時間指定」モードで開いていたが、その分岐は不要になったため削除済み）。

**基本的に各ステップは実際の操作でのみ進む。** 静的な説明を読んで進むのではなく、実際にタップ・入力・ドラッグしてもらうことでBrainBoxの使い方を体感してもらう設計（読まれにくい説明文・無駄な操作回数を減らす狙い）。**例外**: `TourStepDef.showNextButton`をtrueにしたステップだけは吹き出しに「次へ」ボタンを表示する。ステップ2〜4は特定の操作を指示しない（または完了判定が難しい）説明のみのステップのため、操作を強制せず「次へ」で進められるようにしている。ただし実際に「あとでやる」タスクを保存した場合は`taskSavedSignal`の変化で自動的にも進む——**ステップ2〜4のどのステップの最中に実際に保存を押しても即座に`drag`ステップに向けて進む**（保存後はモーダルが閉じるため、`modal-card`/`name-input-row`を対象とする残りのステップは「対象要素が見つからない」800msフォールバックで自動的にスキップされる）。

- 各ステップは`data-tour="fab-add"` / `data-tour="modal-card"` / `data-tour="name-input-row"` / `data-tour="tour-draggable"`のCSSセレクタで対象DOM要素（スポットライト＝暗転帯に開ける「穴」）を`querySelector`し、`getBoundingClientRect()`で位置を取得（`setInterval(400ms)`＋`resize`/`scroll`で再計測）。
- **ステップ1「タスクを追加してみよう」**（`id:'add'`）: FABをスポットライト。`modalOpen` propが`false→true`になった時点（＝実際にFABをタップしてモーダルが開いた瞬間）で自動的に次へ進む。`FAB`の`onClick`は常に`openAdd()`を呼ぶため、`TaskModal`の`initMode()`により**モードが「あとで」で開く**（通常のタップと同じ挙動。ツアー専用の分岐は無い）
- **ステップ2「「あとでやる」タスクはこちらのタブから追加できます。」**（`id:'save'`）: `data-tour="modal-card"`をスポットライト対象にし、`arrowSelector`で`data-tour="tab-later"`（「あとで」タブ）を指す。タップ可能な穴は光る枠（`highlightRect`、矢印が指す対象の下端＋12pxで打ち切ったもの）と一致しており、ヘッダー〜モードタブまでしか操作できない（名前入力欄は含まれない）。このステップでの進行は後述の「次へ」ボタン（吹き出し内、常にタップ可能）で行うため、名前入力欄をこの時点でタップできる必要はない
- **ステップ3「タスクを入力してみましょう。」**（`id:'laterName'`）・**ステップ4「「あとでやる」タスク一覧に追加されます。」**（`id:'laterConfirm'`）: どちらもステップ2と同じ`data-tour="modal-card"`をスポットライトし、`arrowSelector`で`data-tour="name-input-row"`（アイコン＋タスク名入力欄の行）を指す。対象が画面上部にあるため、`TourStepDef.bubblePosition:'above'`で吹き出しを常に上側固定表示にする（`above`の自動判定は対象が画面下半分にあるかどうかで決まるため、そのままでは吹き出しが下に出てしまう）。**タスク名入力欄のキーボードはステップ2→3の遷移時（「次へ」タップ）に開く**——`ProductTour`のステップ2「次へ」ボタンの`onClick`内で`document.querySelector('[data-tour="name-input-row"] input')`を直接`focus()`する（タップのユーザー操作と同じ呼び出しスタック内で行う必要がある。`useEffect`経由の非同期フォーカスだとiOSでキーボードが開かない不具合があったため、実DOMを直接操作する方式にした）。`TaskModal`の`suppressAutoFocus` prop（`App`側で`showTour&&!modal.task`の間true）はステップ2でモーダルが開いた瞬間の自動フォーカス（`<input>`のマウント時`focus()`）だけを抑止する（ステップ2の時点でキーボードが出ていると画面が窮屈になるため）。`ProductTour`の`onEnterLaterNameStep` prop（`tourFocusNameSignal`→`TaskModal`の`focusNameSignal`）は保険として残しているが、実際のキーボード表示は上記の直接focus()が主体。**ステップ3の「次へ」ボタンは名前が1文字も入力されていない間は非表示で、入力されると表示される**——`ProductTour`が`data-tour="name-input-row"`内のinput要素に直接`input`イベントリスナーを付けて`hasName` stateを追従させる（`TaskModal`の`name` stateは兄弟コンポーネントから見えないため実DOMを監視する）。**名前を一度入力してから全部消した場合はボタンも再度隠れる**。この結果、ステップ3で名前を入力せず「次へ」を押すことは構造上できなくなったため、`onSkipLaterName`/`tourFillTestNameSignal`/`fillTestNameSignal`（仮の名前「テスト」を自動で入れる仕組み）は現状到達しない防御的なフォールバックとして残っている
- **ステップ5「あとでやるタスクが空き時間カードに表示されます。／タスクを長押ししてタイムラインにドラッグしてみましょう。」**（`id:'drag'`）: `data-tour="tour-draggable"`をスポットライト。この属性は`FreeTimeCard`内の「あとでやる」タスクのピル（`fits.map`、`laterPool`全件を表示）にのみ付与している——**タイムライン上の通常のスケジュール済みTaskCardには付けない**（過去に両方へ付けていたことがあり、DOM順で先に来るスケジュール済みタスクの方が`querySelector`にヒットしてしまい、あとでやるタスクではなく無関係な既存タスクがスポットライトされる不具合があった）。ステップ2〜4で保存した新規タスクは`laterPool`の並び順的にサンプルタスクより先に来るため、最初に描画される空き時間カードの最初のピルとして自然とスポットライトされる。既存のドラッグ完了処理（`onEnd`、`dragTask`のuseEffect内）の`setTourDragSignal(n=>n+1)`を`gestureSignal` propとして受け取り、値が変化したら（＝実際にドラッグ&ドロップされたら）自動で次へ進む
  - **暗転の濃さはステップごとに変える**（`overlayAlpha`）。他ステップは`rgba(0,0,0,0.6)`のままだが、dragステップは空き時間カード内の他の「あとでやる」タスクも見えた方が分かりやすいため`0.3`に弱め、実際にドラッグ中（`isDragging` prop、`App`の`!!dragTask`から渡す）はタイムライン全体が見えるよう`0.08`までさらに弱める
  - **ドロップした瞬間にオーバーレイ・吹き出しを消し、2秒待ってから完了ポップアップを表示する**——`dropped` stateをtrueにすると`ProductTour`は`null`を返して何も重ねなくなり、タイムラインに追加された結果がそのまま見える。2秒後に`goNext()`（最終ステップなので`showCompletion`がtrueになり完了ポップアップを表示）。この2秒待ちの間は「対象要素が見つからない場合の800msフォールバック」（`tour-draggable`が消えるため`rect`がnullになる）を`dropped`で明示的に無効化しないと、意図した2秒より先に800ms側が`goNext()`を呼んでしまう
- **スポットライト演出**: タップ可能な「穴」は`highlightRect`（`arrowSelector`があればその対象の下端＋12pxで`rect`を打ち切ったもの、無ければ`rect`と同じ）そのものと一致させている——**光っている場所と吹き出し（ボタン）以外は一切タップに反応しない**設計。`highlightRect`の四方を覆う4枚の暗転帯が`pointer-events:auto`でタップを吸収し、`highlightRect`自体には何も重ねないため実際の操作がそのまま機能する。`highlightRect`の枠には`pointer-events:none`の光る枠線（`globals.css`の`tourPulse`/`tourScale`キーフレームで呼吸するようなパルスアニメーション）を重ねて視覚的に注目させる。TaskModal自体はz-50、ツアーのオーバーレイはz-[220]なので、モーダルをスポットライトするステップでもモーダルの上からスポットライトを重ねて正しく機能する
- 吹き出し（タイトル・本文・矢印、ボタン無し／一部ステップのみ「次へ」ボタン）は`globals.css`の`tourBlink`で点滅する三角形の矢印付き。対象が画面下半分にあれば吹き出しは上に、上半分にあれば下に自動配置（`TourStepDef.bubblePosition`で固定した場合はその値を優先）。`pointerEvents:'none'`なので対象操作を妨げない
- **`bubblePosition:'above'`（laterName等）の吹き出しの最小y座標は、固定pxではなくページインジケーター行（スキップボタンのある行）の実測下端＋12pxを使う（`indicatorRef`＋`indicatorBottom` state）。** 固定56pxだとキーボード表示時に対象（`name-input-row`）が画面上部に押し上げられ、吹き出しがステータスバー付近まで迫って見えづらくなる不具合があり、108pxに上げるとキーボード非表示時にヘッダーへの重なりが大きくなりすぎる、という板挟みが起きた実績がある。ページインジケーター行自体がすでに`env(safe-area-inset-top)`を考慮して正しい位置に描画されるため、その実測値を基準にすることでデバイスのノッチ有無やキーボード表示状態に関わらず自然に避けられる
- **laterNameステップは`bubblePosition:'above'`ではなく`'below'`にしている。** 対象（タスク名入力欄）は画面上部にあるため自動判定だと`'above'`（吹き出しが対象の上）になるが、`'above'`は「対象の上端 − 吹き出しの高さ − 余白」で top を逆算する必要があり、`bubbleBoxRef`で実測した高さを使っても「次へ」ボタンが表示されて吹き出しが伸びた瞬間・実機でのレイアウト確定タイミングのズレなどで一時的に高さが古いまま計算され、吹き出しの下端がタスク名入力欄に重なる不具合が繰り返し発生した。`'below'`は「対象の下端 + 余白」を top にするだけで、吹き出し自身の高さがどう変化しても top 自体は動かず下方向に伸びるだけなので、高さの実測・タイミングに一切依存せず構造的に重なりが起きない。**`bubblePosition:'above'`はまだ`add`/`drag`ステップ（対象が画面下半分にある場合の自動判定）で使われているため、`indicatorBottom`ベースの最小y座標クランプ自体は削除しないこと。** 高さが動的に変わる対象（ボタンの表示切り替えなど）に吹き出しを付ける時は、可能な限り`'above'`ではなく`'below'`を使うこと。
- **【重要・実機不具合】キーボード表示中にツアーのオーバーレイ全体（ページインジケーター行・吹き出し・暗転帯すべて）が画面から消える不具合があった。** 上記の実測値ベース修正だけでは直らず、原因はiOSのWKWebViewでキーボード表示時に「レイアウトビューポート」と実際に見えている範囲（`window.visualViewport`）がズレる既知の挙動で、`position:fixed`の要素がそのズレの影響で画面外に押し出されていたため（ページインジケーター行ごと消えていたことから、個別要素の位置計算ではなくオーバーレイ全体の基準がズレていると判明した）。`window.visualViewport`の`offsetTop`/`height`を`resize`/`scroll`イベントで追従し（`vv` state）、最上位のオーバーレイ`<div className="fixed inset-0 z-[220]">`に`transform: translateY(vv.top)`を適用してズレを補正、`vh`計算にも`window.innerHeight`ではなく`vv.height`を使うよう変更した。**この種の「キーボード表示中だけ`position:fixed`要素が消える/ズレる」系の不具合は、Playwrightのヘッダレスブラウザでは本物のOSキーボードを再現できないため検証できない。** 対策コードを書いたら必ず実機（Xcode実機ビルド）で確認してもらうこと。ビューポートの単純なリサイズ（`page.setViewportSize`）で代用したテストは、レイアウトビューポートとvisualViewportが常に一致してしまうため、この種のズレは再現できず「直ったつもり」になりやすい
- **矢印（三角）は「吹き出しに接する側が太く、対象に向かって細くなる」向きで統一する**（一般的なスピーチバブルの尻尾と同じ向き）。`above`（吹き出しが対象の上に出る＝しっぽは吹き出しの下側、`bottom:-8`）の時は`borderTop`、`!above`（吹き出しが対象の下に出る＝しっぽは吹き出しの上側、`top:-8`）の時は`borderBottom`を使う（`above ? {bottom:-8, borderTop:'8px solid white'} : {top:-8, borderBottom:'8px solid white'}`）。**CSS三角のborder-top/border-bottomどちらを太い側にするかは実装時に混同しやすく、過去に何度も見た目を逆にする不具合が発生した実績がある**（`border-◯◯`で指定した辺が「太い方の底辺」になる、`position:absolute`の`top`/`bottom`のどちらでオフセットしているかで「吹き出しに接する側」が変わる、の2点を同時に把握する必要があるため）。**向きを変える依頼が来たら、必ずPlaywrightで実際にレンダリングしピクセル単位（またはズームしたスクリーンショット）で「太い側」がどちらを向いているか確認してから直すこと**（`getComputedStyle`のborderTopWidth/borderBottomWidthを見るだけでは「太い側が吹き出し側か対象側か」までは分からない。実際に描画してみないと判断を誤る）
- **吹き出しの上下配置・矢印の水平位置は、スポットライト範囲（`rect`）ではなく`arrowTarget`（`arrowSelector`があればその対象、無ければ`rect`と同じ）を基準に計算する。** スポットライトが広い範囲（モーダル全体など）の場合、`rect`そのものを基準にすると吹き出しがその範囲の端（モーダル下端など）に配置されて対象から離れすぎるため。矢印の水平位置は吹き出し左端からのオフセット`arrowLeft`として計算し、吹き出し幅の範囲内にクランプする。**過去の不具合**: 矢印を吹き出し左端から固定`left:24`にしていたところ、対象が画面右側にある場合（FABなど）に矢印が対象と無関係な位置を指してしまい、吹き出しと対象の位置関係が分かりにくくなっていた。
- **対象要素が見つからない場合**は800ms待って自動的に次のステップへスキップする（何らかの理由で対象が描画されない場合でもツアーが止まらない安全策）
- **スキップボタン**はページインジケーターの右に控えめなプレーンテキスト（`text-white/40`、背景無し）で表示する。以前は`bg-black/30 rounded-full`のピル型で目立っていたが、ツアーからの離脱を誘発しないよう控えめなデザインに変更した
- 最終ステップの後は完了画面（チェックアイコン＋「ツアー完了！」＋「はじめる」ボタン）を表示してから`onFinish()`を呼ぶ。「スキップ」ボタンは完了画面を経由せず即座に`onFinish()`を呼ぶ。`onFinish`は`App`側で`TOUR_COMPLETED_KEY`をセットして`showTour`をfalseにし、続けて`maybeShowNotifPrompt()`（通知→位置情報→起床・就寝プロンプトの連鎖）を呼ぶ（スキップしてもこの連鎖には入る）

**サンプルタスク（`tourSampleTasks`）:** ツアー中は「牛乳を買う」「クリーニングを受け取る」「振込をする」の3件を空き時間カード・あとでやるリストに表示し、アプリが実際に使われている状態を疑似的に見せる。**実データ（`tasks` state・localStorage）には一切保存せず**、`showTour`がtrueの間だけ`filteredTasks`の算出時に`[...tasks,...tourSampleTasks]`として表示用に合成する（`tourSampleTasks`自体は`useState`のみで永続化しない）。`showTour`がfalseになると同じエフェクトで`tourSampleTasks`を空配列にリセットする。ステップ5でドラッグする対象は、ユーザーが実際に保存した新規タスクが（配列の並び順的に）サンプルより先に来るため自然とスポットライトされる。

**方針: ツアー関連のクリーンアップ処理を将来追加する場合、ユーザーが実際にステップ3で入力して保存した本物のタスク（`tasks` state・localStorageに実在するもの）は消してはいけない。** 消してよい・消す対象になり得るのは`tourSampleTasks`（永続化されない表示専用の疑似データ）だけ。現状（このセッション時点）はツアー完了・スキップ・開発者モードでの「プロダクトツアー」「初回起動」リセットのいずれも`tasks`を書き換える処理を持たないため、この問題は起きていないが、今後ツアーのやり直し体験を作る際などにこの区別を壊さないこと。

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
- **表示条件判定**（`loaded && !showTour`のタイミングで6秒後に1回だけ判定、`recommendPickedRef`で1セッション1回に制限）:
  - インストールから3日以上経過していること（`daysBetween`）
  - 前回何らかのおすすめを表示してから2日以上経過していること（`featureUsage.lastRecommendationShownAt`、機能を跨いだグローバルな間隔）
  - 対象機能が未使用であること（`featureUsage[def.usedKey]`が未設定）
  - その機能の表示回数が2回未満であること、却下してから7日未満でないこと
  - 位置情報の許可が必要な機能（`requiresLocationPermission`）は、既に拒否されている場合は提案しない（`checkGeofencePermissions()`で確認。**許可を拒否された機能を再度求めない**という要件のため）
- 条件を満たす最初の1件を`showRecommendation(id)`で表示（`shownCount`をインクリメントし`lastShownAt`/`lastRecommendationShownAt`を更新）
- UIは画面下部（Bottom Barの上）の小さいカード（フルモーダルではない）。「使ってみる」→`useRecommendation()`が該当機能の画面を開く（買い物リスト→`activeTab='shop'`、場所通知→設定の`notifications-shop`サブ画面、繰り返しタスク→`openAdd()`）。「今はしない」→`dismissRecommendation()`が`dismissedAt`を記録して閉じる（7日間は再表示しない）

### 避けるパターン

- おすすめ機能とプロダクトツアーを同時に表示しない（おすすめ機能の表示条件が`!showTour`でガードしている）
- 削除済みの`Onboarding.tsx`・`ONBOARDING_KEY`・`showOnboarding`（複数ページのスワイプ式イントロ）を新しいセッションで復活させない。単一画面の「ウェルカム画面」（`Welcome.tsx`）は別物として存在するので混同しない
- ウェルカム画面・プロダクトツアーの表示可否判定に新しいlocalStorageキーを追加しない（`TOUR_COMPLETED_KEY`1つだけで両方を判定する設計。「あとで見る」もツアーの「スキップ」も同じくこのキーをセットする）
- プロダクトツアー→通知許可→位置情報許可→起床・就寝プロンプトの順序を変えない（アプリに触る前に許可や設定を求めると離脱されやすいため、意図的に起床・就寝設定を最後に回している）
- 通知・位置情報の許可にBrainBox独自の説明ポップアップ（`showNotifPrompt`/`showLocPrompt`）を復活させない。意図的にApple純正の許可ダイアログへ直接進む設計に変更済み。`requestNotifyPermission()`/`ensureGeofencePermission()`を同期的に連続で呼ばない（順序が保証されなくなる。必ず`.finally()`で前のダイアログの完了を待ってから次を呼ぶこと）
- プロダクトツアーの対象要素に`data-tour`属性を付け忘れない（`ProductTour`は`querySelector`でこれらを探すため、対象のJSXを変更する時は属性ごと移動させること）
- `data-tour="tour-draggable"`をタイムライン上の通常のスケジュール済みTaskCardに付けない（`FreeTimeCard`内の「あとでやる」タスクのピルにのみ付与する設計。`querySelector`は最初にDOM順で見つかった要素を使うため、両方に付けるとスケジュール済みタスクの方が先にヒットしてしまい、あとでやるタスクがスポットライトされなくなる不具合の実績あり）
- 吹き出しの矢印の水平位置を固定値（`left:24`等）に戻さない（対象が画面右側にある場合に矢印が対象と無関係な位置を指してしまう不具合の実績あり。`arrowRect`（`arrowSelector`が指す要素、省略時はスポットライト対象）の中心座標に動的に追従させる設計を維持すること）
- 時間指定（`scheduled`）タスク作成のフルフロー（時間指定タブ説明→ピッカー→保存→タイムライン確認）をプロダクトツアーに復活させない（ツアーが長くなりすぎるため意図的に撤去し、「あとでやる」タスクの作成フローのみに一本化した設計）
- タップ可能な穴を`rect`基準に戻さない。**光っている場所（`highlightRect`）と吹き出しのボタン以外は反応しない**設計にしてある（以前は`rect`全体がタップ可能で`highlightRect`は視覚的な強調のみだったが、モーダル内の無関係な項目に誤ってタップしてしまうのを防ぐため`highlightRect`＝タップ可能範囲に統一した）。視覚的な強調範囲を変えたい時は`highlightRect`の計算（`arrowSelector`の下端＋12px）を調整すること
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

**アイコン行（サブタスクあり OR メモあり）**

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
</div>
```

- `openPanel: 'subtask' | 'memo' | null` — 排他的プルダウン

### FreeTimeCard（空き時間カード）

- 高さは時間軸に依存しない。`calcFreeContentH(laterPoolForEstimate)` で表示するチップを全件表示できる最小高さを計算
- `calcFreeContentH` は全角文字（CJK等）を14px、半角を7px として折り返し行数を計算する
- `ResizeObserver` で実測した高さを `measuredH['free-${slot.start}']` に保存し、次フレームのレイアウトに反映
- スタイル: `<div style={{minHeight:'${height}px'}}>` — クリップなし、内容に応じて伸長可
- **チップ表示数の上限（`FREE_CARD_MAX_CHIPS=8`、Timeline内）:** 「あとでやる」が多いとカードが際限なく巨大化するため、先頭8件のみ`fits`（実際にスケジュール・ドラッグ可能なチップ）として`FreeTimeCard`に渡し、残りは件数を`moreCount` propで渡して非インタラクティブな「+N件」チップ（`onSchedule`もドラッグも効かない、ただのラベル）として末尾に表示する。全件は「あとでやる」タブ（BottomTabs）で見られるため、ここでは全件表示にこだわらない設計。`calcFreeContentH`の見積りにも「+N件」チップぶんの疑似要素を足した`laterPoolForEstimate`を渡し、見積りと実際の表示のズレを防ぐ

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
4. 削除ボタン（編集時のみ）

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

**過去の不具合: ゴミ箱ドロップ（削除）だけ`dragTask.recurrence`のチェックが無く、繰り返しタスクの1件を確認なしで即削除していた。** タイムライン内の時刻変更ドラッグは`pendingDragMove`で確認するのに、画面下部の「あとでやる／ゴミ箱」ドロップゾーンへのドラッグ（`onEnd`内の`isInTrash`/`isInLater`分岐）はどちらも`dragTask.id`だけを見て即座に`setTasks`していた。「あとでやる」への移動は非繰り返しタスクと同じ単一インスタンス操作として妥当だが、ゴミ箱（削除）は`TaskModal`の削除確認（この予定のみ削除／すべての予定を削除）と一貫性が無く、繰り返しタスクの特定の1日分だけが確認なしで消えてしまう不具合だった。修正: `isInTrash`分岐に`dragTask.recurrence`のチェックを追加し、繰り返しタスクなら`pendingDragDelete`state経由で`TaskModal`と同じ`deleteThisOccurrenceButton`/`deleteAllOccurrencesButton`の確認ポップアップを表示するようにした（`delTask(id, seriesOf?)`を流用）。**新しくドラッグ&ドロップの分岐を追加する時は、タイムライン内リスケジュールだけでなく、ゴミ箱・あとでやるドロップゾーンも含めて`dragTask.recurrence`のチェック漏れがないか確認すること。**

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

**「あとでやる」一覧の並び替え（`ReorderLaterPopup`、専用ポップアップ方式）:** 一覧（`BottomTabs`本体）内で直接ドラッグする方式は撤去済み。ピン留めタスクは並び替え対象外（常に先頭固定・ポップアップにも出てこない）。これは**タイムラインへのスケジュール化ドラッグとは別物**——BottomTabsの「あとでやる」一覧からタイムラインへ直接ドラッグ&ドロップする機能はさらに以前に廃止済み（`FreeTimeCard`のチップからタイムラインへのドラッグ&ドロップは引き続き別途存在し、そちらは影響を受けていない。プロダクトツアーの最終ステップが対象にしているのもそちらのFreeTimeCardのチップ）。

- 「あとでやる」セクション見出しの右、既存の並び替えボタン（`sortDir`、↑↓/↑/↓、時間指定・繰り返しセクションと共有）の**隣に新しいボタンを追加**した（`nonPinnedLater.length>1`の時のみ表示）。既存の並び替えボタンは3セクション共有のため、機能を混ぜずに専用ボタンを別途置く設計にした
- 新ボタン押下で`ReorderLaterPopup`（`showReorderPopup` state）を`fixed inset-0 z-[100]`のポップアップとして開く。`BottomTabs`本体（`z-50`）より上に重ねるため、`BottomTabs`の`return`をFragmentでラップしポップアップをその外側の兄弟要素として描画している
- ポップアップ内の各行には**常時ドラッグ可能な専用ハンドル**（`AppIcons.dragHandle`、行右端）があり、行本体はタップ不可（編集も呼ばない）。ハンドルの`onTouchStart`が直接ドラッグを開始する（長押し待ちが無い）ため、「タップで編集」との判定分岐や「一覧スクロールとの競合」がそもそも発生しない——これが直接ドラッグ方式から専用ポップアップ方式に切り替えた理由（後述の過去の不具合を参照）
- ジオメトリ（各行の初期 top/height）は `getBoundingClientRect()` でドラッグ開始時に1回だけ計測し `slots` ref に固定する。以後は指の移動量（ドラッグ開始位置からの累積 `dy`）だけで「今どの固定スロットに重なっているか」を判定し、`order`（並び替え中の `id` 順序、ポップアップのローカル state）を更新する。スロット自体は再計測しない
- ドラッグ中は`document`に直接`{passive:false}`の`touchmove`/`touchend`/`touchcancel`リスナーを付けて`e.preventDefault()`する（`useEffect`、`[dragId]`依存）——App本体のタイムラインドラッグ`startDrag`と同じパターン。新しく行内タッチドラッグ機能を作る時はこのパターンに倣うこと
- ポップアップ内の並び替えは**親の`tasks`にはまだ反映せず**、ポップアップ自身のローカル`order` stateだけで完結する。ヘッダーの「完了」（`taskModalDone`）ボタンを押した時に初めて`onReorderLater(order)`（＝`reorderLaterTasks`、App コンポーネント）を呼んでポップアップを閉じる。オーバーレイタップで閉じた場合は破棄され、`tasks`は変更されない
- `reorderLaterTasks(orderedIds)`（App コンポーネント、変更なし）は、`tasks` 配列内でのそのタスク群の**スロット位置はそのまま**（他の日付・時間指定タスクとの相対位置を変えない）、中身の並び順だけ `orderedIds` に差し替える実装。他のタスク（あとでやる以外）の並びには影響しない

**過去の不具合（実機で「ドラッグしづらい」→一覧内直接ドラッグ自体を撤去）:** 当初は一覧の行に直接、長押し500ms→vibrateでドラッグ開始する方式で実装していた。実機で「めちゃくちゃドラッグしづらい」という不具合が報告され、原因は①長押し待ち中も含めて行要素に直接付けたReactの合成`onTouchMove`だけで移動判定しており、どんな微小な移動（指の自然な震え、数px）でも即座に長押しがキャンセルされ長押し自体がほぼ成立しない、②実際のドラッグ中もReactの合成タッチイベントはpassive登録されており`e.preventDefault()`が効かず、ドラッグ中に一覧が裏でスクロールしてしまいドラッグと競合する、の2点だった。12pxの移動許容範囲＋`document`への`{passive:false}`リスナーという修正（後述のポップアップ内ドラッグと同じ対処）を一度適用したが、それでも「一覧のスクロール」「タップで編集」「長押しでドラッグ」という3つの操作が同じ行の上で競合する構造自体がユーザー体験として不安定だったため、**一覧内で直接ドラッグする方式自体を撤去し、常時ドラッグ可能な専用ハンドルを持つ独立したポップアップ（`ReorderLaterPopup`）に切り出した**。スクロールとの競合が起きうる一覧に汎用的な並び替えドラッグを実装する時は、最初から専用ハンドル＋独立ポップアップ方式を検討すること（iOSの標準的な「編集モード」と同じ発想）。

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

### 設定 → 表示設定 → 週の開始日・文字サイズ

「表示設定」グループ内、空き時間カードと言語の間に2行追加してある（テーマカラー→アプリアイコン→空き時間カード→**週の開始日**→**文字サイズ**→言語）。どちらも `sub==='language'` と同じ、シンプルな選択肢リスト＋チェックマークのピッカー画面（`sub==='weekStart'`/`sub==='fontSize'`）。

**週の開始日（`Settings.weekStartsOn?:0|1`、0=日曜始まり・デフォルト）:**

カレンダー系グリッド（メインヘッダーの週カレンダー・`CalendarPage`月間カレンダー・生活パターンのミニカレンダー）はすべて `weekDayOrder(weekStartsOn)`（曜日ヘッダーの並び順を返す）と `monthFirstOffset(jsDay,weekStartsOn)`（`Date.getDay()`の0=日曜起点オフセットを週開始日基準のオフセットに変換）の2つの共通ヘルパー経由で曜日の並びを揃える。新しくカレンダーグリッドを追加する時もこの2つを使うこと（`Date.getDay()`の生値をそのまま曜日ヘッダーの配列インデックスに使わない）。`MonthCalendar`コンポーネントは現在どこからも呼ばれていないdead codeのため対応不要。

**文字サイズ（`Settings.fontSize?:'small'|'standard'|'large'|'xlarge'`、デフォルト`'standard'`）:**

**過去の失敗: 初回実装はCSSの`zoom`プロパティで画面全体（アイコン・余白・カード幅を含む）を一括拡大縮小する方式にしていたが、実機で確認したユーザーから「文字が大きくなった気がしない／アイコンは大きくしなくていいので文字だけ大きくしたい」というフィードバックがあり、方式ごと作り直した。** zoom方式は視覚的な変化の大部分がアイコン・余白の拡大から来ており、肝心の文字の拡大が相対的に地味に感じられる上、要望そのもの（文字だけ拡大したい）にも合っていなかった。

現在の実装は、`globals.css`の`--text-delta`カスタムプロパティと、page.tsx全体で実際に使われている文字サイズクラス（Tailwind標準の`text-xs`〜`text-3xl`、および`text-[15px]`のような固定pxのarbitrary値）を`calc(基準px + var(--text-delta))`で`!important`上書きする方式。**アイコンサイズ・padding・gap・カード幅などレイアウト系の値は一切変更しないため、文字だけが拡大縮小される。**

**倍率（`*`）ではなく加算（`+`）にしている点が重要。** 最初は倍率で実装したが、`8px`前後の小さいラベル（時刻表示など）は`8px*1.3=10.4px`のようにほとんど変化せず、「拡大した実感が薄い」というフィードバックを受けて加算方式に作り直した。加算なら`8px+4px=12px`のように、どのサイズ帯でも同じだけ確実に大きくなる。

```css
/* globals.css */
:root { --text-delta: 0px; }
.text-sm       { font-size: calc(14px + var(--text-delta)) !important; line-height: calc(20px + var(--text-delta)) !important; }
.text-\[15px\] { font-size: calc(15px + var(--text-delta)) !important; }
/* ...実際に使われている全サイズ分（text-xs〜text-3xl、text-[8px]〜text-[20px]）を列挙 */
```

```typescript
// App コンポーネント内
useEffect(()=>{
  const delta={small:-1,standard:0,large:2,xlarge:4}[settings.fontSize??'standard'];
  document.documentElement.style.setProperty('--text-delta',`${delta}px`);
},[settings.fontSize]);
```

- 標準（`--text-delta:0px`）の時は`calc(14px + 0px)`のように元の値と完全に一致するため無害。全サイズ帯で常時ルールを適用したままにしてよく、条件分岐でCSSの出し入れをする必要はない
- Tailwindの標準クラス（`text-xs`〜`text-3xl`）は`font-size`と`line-height`のペアで上書きする（Tailwindのデフォルトテーマ自体がこの2つをセットで定義しているため、`font-size`だけ上書きすると`line-height`が追従せず、拡大幅が大きい時に行の中で文字が窮屈になる）。`text-[Npx]`の固定pxクラスは元々`line-height`を個別指定していないため`font-size`のみでよい
- **新しく`text-{size}`や`text-[Npx]`のクラスを追加する時は、このCSSブロックにも同じpx値の行を追記すること。** 追記を忘れると、そのクラスだけ文字サイズ設定の対象外になる（見た目には何も壊れないが、設定を変えても該当箇所だけ拡大縮小されない）
- ヘッダーの拡大縮小を個別に除外する処理は不要（アイコン・レイアウトを一切動かさないため、英語化対応時に見つかった"Aug 2026"の折り返し問題のような横幅超過は起きにくい。実際に英語+特大の組み合わせでも確認済み）。ただし新しく横幅の余裕がないUIを追加した時は、文字が伸びるだけでも詰まる可能性があるため`xlarge`で確認する習慣は持つこと

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
| `textSize` | TextAa | | |

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

**実機不具合の調査で、同じ対処（Build/Version揃え・再インストール等）を何度試しても改善しない場合は、推測だけで次の対処を続ける前にWebSearchで同じ症状の既知情報がないか調べること。** 実際にこのパターンで「Lock Screen widgetが`.containerBackground(for: .widget)`指定漏れでエラー表示のままになる」という既知の原因をWebSearchで見つけ、繰り返す試行錯誤を終わらせられた実績がある。ユーザーからの明示的な要望でもある。

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
| `NEXT_PUBLIC_FIREBASE_API_KEY` 他6件 | Firebase Analytics（Web用）。詳細は下記「Firebase Analytics」節を参照 |

---

## Firebase Analytics（利用状況計測）

BrainBoxはFlutterではなくNext.js/Capacitorのアプリなので、FlutterFire CLI・`firebase_core`・`firebase_analytics`（Flutter用パッケージ）は使えない。代わりに **Web: Firebase JS SDK（`firebase/analytics`、GA4計測）／iOSネイティブ: Firebase iOS SDKをラップした自作Capacitorプラグイン（`AnalyticsPlugin`）／Androidネイティブ: Firebase Android SDKをラップした自作Capacitorプラグイン（`AnalyticsPlugin`）** という、このリポジトリの他機能（Geofence・LocalNotify等）と同じ「JS薄いラッパー→ネイティブはCapacitorカスタムプラグイン」構成で実装している。

### アーキテクチャ

```
src/app/components/Analytics.ts   … logAnalyticsEvent(name, params) を全画面から共通で呼ぶ窓口
  ├─ ネイティブ: registerPlugin('AnalyticsPlugin') 経由でCapacitorプラグインを呼ぶ
  └─ Web/開発環境: firebase/app + firebase/analytics を動的importして gtag ベースのGA4計測を行う
       （NEXT_PUBLIC_FIREBASE_* が1つでも未設定なら何もせず静かに終了する。ローカル開発でFirebase
       プロジェクト未設定でもアプリが壊れないようにするための設計）
native-ios/AnalyticsPlugin.swift/.m  … Analytics.logEvent(name, parameters:) を呼ぶだけの薄いプラグイン
native-ios/BridgeViewController.swift … capacitorDidLoad() 内で FirebaseApp.configure() を一度だけ呼び、
       AnalyticsPluginを登録する（AppDelegate.swiftは編集しない。既存プラグインと同じ最小限の変更方針）
```

`logAnalyticsEvent(name, params?)` は`src/app/page.tsx`・`src/app/components/Premium.tsx`から呼ぶ。失敗しても例外を投げず（try/catchで握りつぶす）、Analytics側の不具合がアプリ本体の動作に影響しないようにしている。

### プライバシー方針（重要・必ず守ること）

**送ってはいけないもの:** タスク名、買い物リストの中身、メモの内容、住所・施設名、緯度・経度、メールアドレス、ユーザー名、その他個人を特定できる情報。

**場所通知イベント（`location_notification_created`）は、実際の場所の名前・住所・緯度経度を一切paramsに含めず、半径（`radius`: 100/300/500の数値）のような非識別の設定値のみ送る。** 「スーパー」「薬局」等の一般カテゴリを送る案も検討したが、このアプリの場所登録は自由入力（プリセットの「自宅」「職場」等はあるがユーザーが自由に書き換えられる）でカテゴリ分類の仕組みが無いため、誤って個人を特定しうる文字列を送るリスクを避けて**何も送らない**方針にした（イベント発火自体で「場所通知を設定した」という事実は計測できる）。

新しいイベント・パラメータを追加する時は、必ずこのプライバシー方針に照らして「このparamsに個人を特定しうる情報が紛れ込んでいないか」を確認してから実装すること。

### 計測イベント一覧

| イベント名 | 発火箇所 | 備考 |
|---|---|---|
| `task_created` | `App.saveTasks()`（新規タスク保存時） | `params.mode`: `'later'\|'scheduled'\|'recurring'` |
| `task_completed` | `App.toggle()` | 完了→未完了に戻す操作では発火しない |
| `task_deleted` | `App.delTask()`、タイムラインのドラッグ&ドロップでゴミ箱にドロップした時 | |
| `later_task_created` | `App.saveTasks()`（新規タスクが`isLater:true`） | |
| `later_task_moved_to_timeline` | ドラッグ&ドロップの`onEnd`（`dragTask.isLater`なタスクをタイムラインにドロップ） | |
| `shopping_item_created` | `App.addShopItem()` | |
| `shopping_item_completed` | `App.toggleShop()`（未購入→購入済みへの遷移のみ） | |
| `timeline_task_added` | `App.saveTasks()`（新規タスクが時間指定で`startTime`あり） | |
| `timeline_task_moved` | ドラッグ&ドロップの`onEnd`（元々時間指定済みタスクの時刻を変更） | |
| `time_notification_created` | `App.saveTasks()`（`notifications`配列が空→非空に変わった時のみ） | 新規タスク作成・既存タスク編集どちらも対象 |
| `location_notification_created` | `App.saveTasks()`（`Task.locationNotify`がfalse→trueに変わった時）、`ShopLocationPanel.confirmAdd()`（新規登録時）、`ForgetAlertsPanel.saveEditing()`（新規登録時） | `params.radius`（場所通知系のみ）以外は送らない |
| `notification_opened` | `App`の`applyPending()`（`GeofencePlugin`の共有`UNUserNotificationCenterDelegate`が`pendingNotificationOpened`フラグを立て、次回起動/フォアグラウンド復帰時に読み取ってクリアする） | 全通知カテゴリ共通の1つのdelegateを経由するため種類を問わず計測できるが、種類（どの通知か）までは区別していない |
| `product_tour_started` | `App`のツアー表示分岐（`maybeShowProductTour()`、および初回ロード時の既存ユーザー向けフォールバック分岐）で`setShowTour(true)`と同時に発火 | |
| `product_tour_completed` | `ProductTour`の`onFinish(false)`（完了画面の「はじめる」ボタン） | |
| `product_tour_skipped` | `ProductTour`の`onFinish(true)`（「スキップ」ボタン、`handleSkip`） | |
| `paywall_viewed` | `ProGateSheet`のマウント時、`SettingsScreen`で`sub==='premium'`になった時 | |
| `subscription_started` | `Premium.tsx`の`purchase()`（購入成功で`ENTITLEMENT_ID`がアクティブになった時のみ） | |
| `location_reminder_triggered` | `App`の`applyPending()`（`getFiredTaskLocationIds()`で「あとでやる」タスクの場所通知が発火済みと分かった時） | `params.type:'task'`固定。`didEnterRegion`（到着）時点でネイティブ側にfiredフラグが立つ設計のため、通知をタップしたかどうかに関わらず実際に発火したタイミングを計測できる。**買い物リストの場所通知・忘れ物防止アラートは対象外**（ネイティブ側が「タップされたか」しか記録しておらず、「発火したか」自体を読み取るAPIが無いため。追加するにはGeofencePlugin.swiftへのネイティブ変更が必要） |
| `notification_permission_granted` | `Geofence.ts`の`ensureGeofencePermission(source)`・`LocalNotify.ts`の`requestNotifyPermission(source)`が許可結果を確認した時 | `params.source`: `'onboarding'\|'settings'\|'shop_location'\|'task_location'\|'forget_alert'`。`logPermissionGrantedOnce()`によりインストールごとに1回だけ計測（同じ許可を何度もリクエストするたびに加算されると許可率の指標として意味を持たないため） |
| `location_permission_granted` | `Geofence.ts`の`ensureGeofencePermission(source)`が位置情報「常に」許可を確認した時 | `params.source`: `'onboarding'\|'shop_location'\|'task_location'\|'forget_alert'`。`notification_permission_granted`と同じく`logPermissionGrantedOnce()`でインストールごとに1回のみ |

**意図的に計測していないもの（スコープ外）:** 繰り返しタスクの一括編集（`editScope==='all'`）保存、「あとでやる」の朝の一括完了（`handleMorningAction`）、繰り返しタスクのドラッグ確認ポップアップ経由の移動。これらは単一操作の裏で複数タスクが変化するバルク処理で、単純な1イベント=1操作の対応にならないため初回実装では対象外にした。買い物リストの場所通知・忘れ物防止アラートの`location_reminder_triggered`も同様の理由（ネイティブ側の記録が「タップされたか」止まり）で未対応。

### ユーザープロパティ（`app_language`）

イベントではなく「ユーザー単位の属性」として、現在アプリに適用されている言語をFirebase Analyticsのユーザープロパティに記録している。GA4/BigQuery側で言語別（`ja`/`en`、今後`es`等を追加予定）にプロダクトツアー完了率・各機能の利用率などをセグメント比較できるようにする用途。

- `Analytics.ts`の`setAnalyticsUserProperty(name,value)` — `logAnalyticsEvent`と同じ「ネイティブはCapacitorカスタムプラグイン経由・Web/開発環境はFirebase JS SDK」構成。ネイティブは`AnalyticsPlugin.setUserProperty()`（`Analytics.setUserProperty(value,forName:name)`を呼ぶ）、Webは`firebase/analytics`の`setUserProperties()`を呼ぶ
- `I18n.tsx`の`I18nProvider`が呼び出し元。**初期state（SSR/hydration対策の仮値`'ja'`）の段階では呼ばない**——初回マウント時に`getStoredLanguage()??detectLanguage()`で言語を確定した直後、その値で1回だけ`setAnalyticsUserProperty('app_language',lang)`を呼ぶ（仮値の`'ja'`を一瞬でも計測してしまうと、実際は英語話者のユーザーが一時的に`ja`として記録される不具合になるため）。加えて`setLanguage()`（設定画面での手動切り替え）でも同様に呼び、言語を変更するたびに最新値に更新する
- 呼び出し名は`'app_language'`固定（Firebase側のユーザープロパティ名の制約: 英数字とアンダースコアのみ・先頭は文字）。値は`Language`型の文字列（`'ja'`/`'en'`）をそのまま渡すため、将来`es`等を`Language`型に追加してSTRINGSを拡張すれば、このプロパティも追加のコード変更なしに新しい値を記録できる

### Xcodeでの手動セットアップ（`AnalyticsPlugin`に`setUserProperty`を追加した場合）

`native-ios/AnalyticsPlugin.swift`/`.m`は新規ファイルではなく**既存ファイルの更新**（`setUserProperty`メソッドを追加）なので、Xcode上の同名ファイルの中身をこの変更後の内容に差し替える（`ios/`はgitignore対象のため`git pull`では自動反映されない）。App Group・Info.plist・Background Modes等の追加設定は不要（既存の`logEvent`と同じFirebaseAnalytics SDK呼び出しの追加のみ）。

### 避けるパターン

- ユーザープロパティを`logAnalyticsEvent`のイベントパラメータ（`params`）として送らない（「今どの言語を使っているか」はユーザー単位で一定期間持続する属性であり、イベントのたびに送るものではない。`setAnalyticsUserProperty`経由でユーザープロパティとして送ること）
- `I18nProvider`の初期state（`useState<Language>('ja')`の仮値）の段階で`setAnalyticsUserProperty`を呼ばない（SSR/hydration対策のための一時的なデフォルト値であり、実際の言語判定が終わる前に計測すると誤った値が記録される）

### 権限許可イベントの一元化（`logPermissionGrantedOnce`）

`ensureGeofencePermission()`（位置情報＋通知）・`requestNotifyPermission()`（通知のみ）は、機能を使うたびに何度も呼ばれる（場所通知の追加のたびに`ensureGeofencePermission`が呼ばれる等）。呼ばれるたびに「許可されている」ことを計測すると、許可率という指標として意味を持たなくなる（1人のユーザーが機能を使うたびに加算されてしまう）。そのため`Analytics.ts`の`logPermissionGrantedOnce(kind,params)`が`localStorage`（`tl-analytics-permission-granted-v1`）でインストールごとに1回だけに制限した上で`logAnalyticsEvent`を呼ぶ設計にし、`Geofence.ts`/`LocalNotify.ts`側で一元的に計測する（呼び出し元のpage.tsxは`source`文字列を渡すだけでよい）。

- `ensureGeofencePermission(source)`: `GeofencePlugin.requestPermissions()`の結果（`res.notifications`/`res.location`）を見て、許可されていればそれぞれ`logPermissionGrantedOnce('notification',{source})`/`logPermissionGrantedOnce('location',{source})`を呼ぶ
- `requestNotifyPermission(source)`: ネイティブの`LocalNotifyPlugin.requestPermission()`はOSダイアログの選択完了後にresolveする（`native-ios/LocalNotifyPlugin.swift`の`call.resolve()`が`requestAuthorization`のcompletion handler内にあるため）。resolve後に`checkGeofencePermissions()`（`Geofence.ts`、位置情報と共通の権限確認API）を呼んで実際の許可状態を確認してから計測する
- 呼び出し元（TaskModal・ShopLocationPanel・ForgetAlertsPanel・オンボーディングプロンプト・設定画面の通知トグル）は`source`ラベル（`'task_location'`/`'shop_location'`/`'forget_alert'`/`'onboarding'`/`'settings'`）を渡すだけで、計測ロジック自体には触れない

### Firebase側のセットアップ手順（ユーザー側の作業）

1. [Firebase console](https://console.firebase.google.com)で新規プロジェクトを作成（Google Analyticsの有効化を選ぶ）
2. プロジェクトに **iOSアプリ** を追加。バンドルIDはXcodeプロジェクトのバンドルID（`jp.brainbox.app`）と一致させる
3. ダウンロードした `GoogleService-Info.plist` は消さずに保管しておく（Xcodeでの手動セットアップで使う）
4. 同じプロジェクトに **ウェブアプリ** も追加し、「SDKの設定と構成」に表示される`apiKey`/`authDomain`/`projectId`等の値を`.env.local`（`.env.local.example`参照）とVercelのプロジェクト環境変数の両方に設定する
5. 同じプロジェクトに **Androidアプリ** も追加。パッケージ名は`android/app/build.gradle`の`applicationId`（`jp.brainbox.app`）と一致させる。ダウンロードした`google-services.json`は消さずに保管しておく（Android Studioでの手動セットアップで使う）

### Xcodeでの手動セットアップ（`ios/`はgitignore対象なので毎回必要）

1. ダウンロード済みの `GoogleService-Info.plist` をXcodeの`ios/App/App/`にドラッグ＆ドロップで追加（Target Membership: App、ファイル名は変更しない）
2. Xcodeメニュー File → Add Package Dependencies → `https://github.com/firebase/firebase-ios-sdk` を追加 → 製品選択で **FirebaseAnalytics**（依存する FirebaseCore も自動で付いてくる）を選び、Target: App に追加
3. `native-ios/AnalyticsPlugin.swift` / `.m` を `ios/App/App/` に追加（Target Membership: App）
4. `ios/App/App/BridgeViewController.swift` の中身を `native-ios/BridgeViewController.swift` の最新内容に差し替える（`import FirebaseCore`・`FirebaseApp.configure()`・`AnalyticsPlugin`の登録が追加されている。既存ファイルは`git pull`しても自動更新されないので、Xcode上で直接コピー&ペーストで差し替えること）
5. （任意・デバッグ用）Xcodeの Product → Scheme → Edit Scheme → Run → Arguments → "Arguments Passed On Launch" に `-FIRDebugEnabled` を追加すると、[Firebase console の DebugView](https://console.firebase.google.com)でイベントをリアルタイムに確認できる
6. ビルド・実行し、タスク作成やドラッグ操作を行って DebugView にイベントが届くことを確認する

### Android実装（`native-android/AnalyticsPlugin.kt`）

プラグイン名を`AnalyticsPlugin`で揃えているため`Analytics.ts`は無改修で動く。iOS版と同じく薄いラッパーのみで、`logEvent(name, params?)`/`setUserProperty(name, value)`の2メソッドだけを実装している。

- `params`（JSON文字列）は`org.json.JSONObject`でパースし、`android.os.Bundle`に詰め替えてから`FirebaseAnalytics.logEvent(name, bundle)`に渡す（値の型ごとにBoolean→文字列・Int/Long→Long・Double→Doubleで`Bundle`に格納。iOS版が`JSONSerialization`で`[String:Any]?`にパースするのと役割は同じ）
- `logPermissionGrantedOnce()`（インストールごとに1回だけの重複防止）は`Analytics.ts`内で完結する`localStorage`ベースのJS側ロジックのため、ネイティブ側の対応は不要（iOS版でもネイティブ変更は無い）
- Firebase Android SDKは`Firebase.analytics`（Kotlin Extensions、`com.google.firebase:firebase-analytics-ktx`）経由で取得する。初期化は`google-services.json`が`android/app/`に置かれていれば`com.google.gms.google-services`プラグインが自動的に行うため、iOS版の`FirebaseApp.configure()`のような明示的な初期化コードは不要（`MainActivity`には`registerPlugin(AnalyticsPlugin.class)`を追加するだけでよい）

### Android Studioでの手動セットアップ（`android/`はgitignore対象なので毎回必要）

1. Firebase側のセットアップ手順で取得した`google-services.json`を`android/app/`直下に配置する（ファイル名は変更しない。`ios/App/App/GoogleService-Info.plist`と同じ役割）
2. `android/build.gradle`の`buildscript.dependencies`に`classpath 'com.google.gms:google-services:4.4.2'`を追加する
3. `android/app/build.gradle`の末尾（他の`apply plugin`の並びの後）に`apply plugin: 'com.google.gms.google-services'`を追加する
4. `android/app/build.gradle`の`dependencies`に`implementation platform('com.google.firebase:firebase-bom:33.5.1')`と`implementation 'com.google.firebase:firebase-analytics-ktx'`を追加する（BOMで依存バージョンを揃えるFirebase公式の推奨構成）
5. `native-android/AnalyticsPlugin.kt`を`android/app/src/main/java/jp/brainbox/app/`にコピーする
6. `native-android/MainActivity.java`の内容で既存の`MainActivity.java`を上書きする（`registerPlugin(AnalyticsPlugin.class)`の行が追加されている）
7. Android Studioで「Sync Now」→ビルドが通ることを確認する
8. （任意・デバッグ用）`adb shell setprop debug.firebase.analytics.app jp.brainbox.app`を実行すると、[Firebase console の DebugView](https://console.firebase.google.com)でイベントをリアルタイムに確認できる（iOS版の`-FIRDebugEnabled`起動引数に相当）
9. これらのファイルを編集した場合、`android/`内の既存ファイルは`git pull`しても自動更新されない（`native-android/`の最新内容を都度コピーし直すこと。他プラグインの節と同じ注意事項）

### 避けるパターン

- `firebase_core`/`firebase_analytics`（Flutter用パッケージ）や FlutterFire CLI を使おうとしない（このアプリはFlutterではない）
- タスク名・メモ・買い物リストの中身・住所・緯度経度・メールアドレス・ユーザー名を`params`に含めない
- 場所関連イベントに実際の場所の名前やカテゴリ推測ロジックを追加しない（自由入力でカテゴリ分類の仕組みが無いため、何も送らない方針を維持する）
- `AnalyticsPlugin`をWidget Extensionターゲットなど他ターゲットに追加しない（メインAppターゲットのみ）
- `AppDelegate.swift`を編集して`FirebaseApp.configure()`を呼ぼうとしない（`BridgeViewController.capacitorDidLoad()`で完結させる設計にしてあるため不要）。Android側も同様に、`google-services`プラグイン経由の自動初期化に任せ、`MainActivity`/`Application`で明示的な初期化コードを書かない
- `notification_permission_granted`/`location_permission_granted`を呼び出し元（page.tsx側）で直接`logAnalyticsEvent()`しない（`ensureGeofencePermission()`/`requestNotifyPermission()`側で`logPermissionGrantedOnce()`により一元管理・重複防止している。呼び出し元は`source`ラベルを渡すだけでよい）

---

## 開発上の注意

- ドラッグ＆ドロップはタッチイベントで実装（長押し500ms → vibrate → drag開始）
- **繰り返しタスクのドラッグ**: drop後に `pendingDragMove` state を介して確認ポップアップを表示
- 繰り返しタスクは `generateCustomDates()` で将来日程を生成し、`tasks` に展開して保存（`weekly`なら最大52件など、1つの繰り返し設定で`tasks`配列に数十件の個別インスタンスが一度に生成される）

**過去の不具合（実際のテスターからの報告で発覚）: 繰り返しタスクを「すべての予定を変更」で編集すると時間が保存されない／削除しても一覧から消えない。**
1. `saveTasks()`の`editScope==='all'`分岐（`name`/`recurrence`/`startTime`が一致するタスクをまとめて更新）が更新フィールドに`startTime`と`color`を含めておらず、時間を変更して保存しても実際には反映されなかった（`duration`は含まれているのに`startTime`が抜けているという非対称な漏れだった）。修正済み。
2. 削除は`delTask(id)`が常に**IDが一致する1件のみ**を削除する実装だった。`generateCustomDates()`は1つの繰り返し設定で数十件のインスタンスを`tasks`に一度に生成するため、BottomTabsの「重複」セクション（`recurringGroups`、`name||recurrence||startTime`でユニーク化した代表1件だけを表示）でその代表行を削除しても、残り数十件の同一シリーズのインスタンスはそのまま残り、次の描画で別のインスタンスが新しい代表として選ばれて同じ行が再び表示される（＝「削除してもずっとリストに残り続ける」ように見える）。サポートページのFAQ（`faqA4`、I18n.tsx）には「この予定のみ削除／すべての予定を削除」を選べると書かれていたが、実際には「すべての予定を削除」自体が実装されていなかった（ドキュメントと実装の乖離）。修正: `TaskModal`の削除確認ポップアップを、`task.recurrence`がある場合は`onDelete('one'|'all')`のスコープ選択2ボタン（`deleteThisOccurrenceButton`/`deleteAllOccurrencesButton`）に変更し、`delTask(id, seriesOf?)`が`seriesOf`（`name`/`recurrence`/`startTime`が一致する全件）を渡された時はシリーズ全体を`filter`で削除するようにした。**繰り返しタスクに新しい一括操作（編集・削除）を追加する時は、`tasks`配列がシリーズごとに多数の個別インスタンスとしてフラットに保持されている前提を踏まえ、IDベースの単純な1件操作だけで済ませないこと。**

**別の関連不具合（同じ調査の続きで発覚）: `customRec`（カスタム繰り返し）は作成時に1回だけ`generateCustomDates()`で固定N件（例: 8回）の日付を生成するだけで、その後自動延長される仕組みが無い。** そのため終了回数が少ない設定（例:「毎日・8回で終了」）は作成から1〜2週間程度で全インスタンスの日付が過去になり、以降どの日付のタイムラインを見ても1件も表示されなくなる。一方`recurringMap`（BottomTabsの「重複」セクション）は`t.date`を一切見ず`!t.completed`だけで代表行を選んでいたため、シリーズが完全に終了していても「毎週日〜土・8次後結束 10:15」のような行が永久に一覧に残り続け、あたかもまだ有効な予定であるかのように見えてしまっていた（実際のテスターからの報告で発覚。「タイムラインには出ないのにあとでやるの重複一覧には出続けている」という症状）。修正: `recurringMap`に渡す候補（スケジュール済み側）に`t.date>=todayStr()`の条件を追加し、未来分の予定が1件も残っていないシリーズは「重複」一覧から自然に消えるようにした（`laterPending`側は「あとでやる」化済みで日付の新旧を問わないため対象外）。**「重複」一覧に新しい絞り込み条件を追加する時は、シリーズが実質終了しているケースを誤って含めないか確認すること。**

**繰り返しタスクを「あとでやる」ゾーンにドラッグした時の表示（仕様変更）:** 従来、繰り返しタスクの1インスタンスを「あとでやる」にドラッグすると（`isLater:true`になる）、`normalLater`（通常の「あとでやる」一覧）が`!t.recurrence`で除外していたため、そのインスタンスは通常の「あとでやる」一覧には現れず、`recurringMap`（「重複」セクション、`laterPending.filter(t=>t.recurrence)`も候補に含めていた）の代表行としてのみ表示されていた。複数の日のインスタンスをそれぞれ「あとでやる」にドラッグしても、同じ`name||recurrence||startTime`キーのため1行に潰れてしまい、どの日の分か区別できない問題があった。修正: `normalLater`から`!t.recurrence`条件を削除して繰り返しタスクも通常の「あとでやる」一覧に含め、`recurringMap`の候補から`laterPending`由来のソースを削除（スケジュール済み・未来分のみを対象にする）。あわせて、「あとでやる」一覧の行（`renderLaterRowContent`）に`t.recurrence&&t.date`の時だけ`laterRecDateLabel(t.date)`（`{date}の分`、`I18n.tsx`の`laterRecurringDateLabel`）を表示し、どの日の予定だったか分かるようにした（非繰り返しタスクは従来通り所要時間ラベルを表示）。
- 「あとでやる」タスクは `isLater: true`、日付をまたいで持ち越し可能
- **過去日付へのタスク追加・ドラッグが可能**（日付制限なし）
- スマートフォン最適化済み（`userScalable: false`、`overscroll-none`）
- BottomTabs のタブパネルは `visibility:hidden` + `pointer-events:none` で非表示にする（`display:none` にするとレイアウト崩れ）
- TaskModal の auto-save useEffect deps に `icon` と `color` を含めること（抜けるとアイコン変更が保存されない）
- 空き時間カードの高さは `minHeight` で指定（`height` では内容がクリップされる）
- `AXIS_X=72`・`CARD_LEFT=108` — ハードコードせず定数から導出すること
- **タスクごとのアラート（`Task.notifications: number[]`、開始時・何分前・前日）は `syncTaskAlerts()` でネイティブに事前予約している**（App コンポーネント、`tasks` 変更のたびに未来の直近60件を計算して `LocalNotifyPlugin.syncTaskAlerts` に渡す）。バックグラウンド/未起動でも発火する。旧来の `now` ポーリング＋即時 `notify()` の `useEffect`（`TASK_ALERT_FIRED_KEY` 使用）はWeb/開発環境専用フォールバックとして残っており、ネイティブでは `isNative()` で早期returnする。新しい通知チェックを追加する際は必ずこの `useEffect` 一覧（複数ある。起床チェックイン・買い物リスト・放置タスク・空き時間提案・タスクアラート（Web fallback）・タスクアラート（ネイティブ事前予約））を grep してから既存パターンに倣うこと
- **アプリ内の全通知は `src/app/components/LocalNotify.ts` の `notify(title, body)` を呼ぶこと。`new Notification(...)` を直接呼ばない。** WKWebViewはWeb Notifications API（`window.Notification`）を実装しておらず、実機では `new Notification(...)` は何も起きずに失敗する（設定アプリのBrainBoxページに「通知」の許可項目自体が出ない＝一度もネイティブの通知許可がリクエストされていない、という形で発覚した実際の不具合）。`notify()` はネイティブでは `LocalNotifyPlugin` 経由で `UNUserNotificationCenter` に直接通知を出し、Web/開発環境では従来通り `window.Notification` にフォールバックする。ただし `notify()` 自体は即時発火なので、呼び出し元の発火判定が `now` ベースのポーリングのままだと**アプリがフォアグラウンドで開かれている間しか動かない**（バックグラウンド/未起動では動かない。それが必要な機能は場所通知・アプリ起動リマインダー・タスクアラートのように専用のネイティブスケジューリング（`syncTaskAlerts`/`GeofencePlugin`/`InactivityPlugin`）が必要）

---

## 多言語対応（i18n、`src/app/components/I18n.tsx`）

**アプリ全体の英語対応は完了済み。** ウェルカム画面・プロダクトツアー・タイムライン・タスクモーダル・設定画面各項目・アイコン選択・PROペイウォール・おすすめ機能・タスク一括入力・カスタム繰り返し設定・場所通知UI・地図ピッカー・朝の確認ポップアップ・起床/就寝設定・繰り返し予定の確認ダイアログ・タブ表示フィルター・プッシュ通知本文・ホーム画面ウィジェット・場所通知/忘れ物防止アラートの通知文（ネイティブ側）・PRO価格表示、まで`STRINGS`/`tr()`（または`language==='ja'?...`分岐）でja/en両対応済み。唯一意図的に未対応のままなのは**開発者モード画面**（アプリバージョン7回タップの検証用メニュー。一般ユーザーには表示されないため）。新しい画面・機能を追加する時は同じ`STRINGS`/`tr()`の仕組みに1文言ずつ追加していく。

**韓国語（`ko`）・繁体字中国語（台湾、`zh-TW`）・スペイン語（`es`）・ポルトガル語（`pt`）・ベトナム語（`vi`）・タイ語（`th`）・インドネシア語（`id`）はいずれもJS/Web側（`STRINGS`全項目・曜日/月名/DUR_OPTS等のオプション配列・テーマ/アプリアイコン名・カスタム繰り返しの要約文・タイムラインヘッダー・アイコン選択画面のカテゴリ名と約90件の個別アイコン名）とネイティブiOS側（ホーム画面ウィジェットのString Catalog・`GeofencePlugin.swift`の言語判定）まで対応済み。** 対応言語は現在 `ja`/`en`/`ko`/`zh-TW`/`es`/`pt`/`vi`/`th`/`id` の9つ。`zh-TW`追加時は韓国語追加時に見つかった「`lang`引数を取る関数（`deadlineRemainLabel`/`durLabel`）や`language==='en'`を直接チェックするローカル関数（`SearchPage`の`fmtDate`・`TaskModal`の`taskDateLabel`）はモジュール共通の`language`変数を使った`grep "language==='ja'"`の監査網に引っかからない」という教訓を踏まえ、実装と同時にこれら4関数へ`zh-TW`分岐を追加済み（別途QAパスで見つけ直す必要はなかった）。`es`・`pt`・`vi`・`th`・`id`追加時もこの教訓を踏まえ実装と同時に同じ関数群へ分岐を追加済み。`detectLanguage()`は`ja`→`ko`→`zh`→`es`→`pt`→`vi`→`th`の次に、`id`で始まる端末ロケールを`id`と判定する設計にした（このアプリは簡体字に対応していないため、`zh-CN`等の簡体字ロケールは「近い言語の方が何も無いよりまし」という判断で`zh-TW`にフォールバックさせている）。スペイン語・ポルトガル語・ベトナム語・タイ語・インドネシア語の追加はいずれもApp Storeの説明文・キーワード・スクリーンショット等（App Store Connect側のメタデータ）を含まない、アプリ本体のみのスコープで実施した（後日別途対応の予定）。**ポルトガル語のホーム画面ウィジェットString Catalogロケールキーは`"pt"`ではなく`"pt-BR"`を使う**（繁体字中国語の`zh-Hant-TW`と同じ理由。Appleの慣例では地域込みの識別子（`pt-BR`=ブラジル・`pt-PT`=ポルトガル）を使うため。アプリ内`Language`型の値は地域を持たない`'pt'`のままなので、`appLanguage`キー経由でSwift側に渡す値と、String Catalogのロケールキーとで表記が異なる点を混同しないこと）。**ベトナム語は地域バリアントを持たない言語なので、String Catalogのロケールキーもアプリ内`Language`型の値と同じ`"vi"`のままでよい**（zh-TW/pt-BRのような読み替えは不要。新しい言語を追加する時は、その言語がApple慣例上リージョン付き識別子を必要とするか毎回確認すること）。**タイ語もベトナム語と同じく地域バリアントを持たない言語なので、String Catalogのロケールキーはアプリ内`Language`型の値と同じ`"th"`のままでよい。** **インドネシア語も同様に地域バリアントを持たない言語なので、String Catalogのロケールキーはアプリ内`Language`型の値と同じ`"id"`のままでよい。**

### アーキテクチャ

- `STRINGS`（`I18n.tsx`）— `{ キー: {ja, en} }`の形で全文言を1ファイルに集約する。ja/enを同じオブジェクトの隣同士に書くことで、後から翻訳を見比べて確認・修正しやすくしている（ja用ファイル・en用ファイルを分けない設計）
- `I18nProvider`（`layout.tsx`で`PremiumProvider`の外側にラップ）— 現在の言語stateと`tr(key)`関数をReact Contextで配る
- `useI18n()`フックが`{ language, setLanguage, tr }`を返す。**翻訳関数はここでは`t`ではなく`tr`という名前にしている**（`page.tsx`本体で`t`はタスク・タグ・テーマ等のループ変数として広く使われており衝突するため。新しく`page.tsx`に文言を移行する時も`tr`のまま使うこと。`t`にリネームしない）
- 言語判定の優先順位: ① `localStorage`の`tl-language-v1`（ユーザーが手動選択済みならこれを最優先）→ ② 端末/ブラウザの言語（`navigator.languages`）が`ja`で始まれば`ja`、それ以外（`en`を含む未対応言語すべて）は`en`にフォールバック。**自動判定はあくまで初回のデフォルト決定用**で、一度でも設定画面から手動選択すると`tl-language-v1`が優先され、以後は端末設定を変えても上書きされない
- `setLanguage(lang)`は即座に`localStorage`へ保存しつつReact stateも更新するため、画面を閉じずにその場で表示言語が切り替わる（リロード不要）
- `I18nProvider`は`language`が変わるたびに`document.documentElement.lang`も同期する

### 設定画面への組み込み

設定 → 表示設定 → 「言語」行（`sub==='display'`画面の最後の行、`tr('settingsLanguageRowTitle')`）から`sub==='language'`のピッカー画面に遷移し、「日本語」「English」「한국어」「繁體中文」「Español」「Português」「Tiếng Việt」「ไทย」「Bahasa Indonesia」の9択から選ぶ（選択中の項目に`AppIcons.checkSquare`のチェックマーク）。この行・ピッカー画面のヘッダーは`tr('settingsLanguageRowTitle')`（現在の表示言語で「言語」/「Language」/「언어」等に切り替わる）を使う。

**過去に多言語併記の固定文言`"言語 / Language / 언어 / 語言 / ..."`にしていた時期があったが、ユーザーからのフィードバックで「システムに合わせた言語で『言語』の文字だけでよい」と明確に指定され、現在の`tr()`による動的表示に変更済み。** 以前この行を動的翻訳にした際に「Language / Language」のような重複表示になった不具合があったとされていたが、原因はこの行専用のキーを使わず既存の別キーを誤用したことなどによるものと考えられ、`settingsLanguageRowTitle`という専用キーを新設し1箇所でのみ使うようにしたことで再発していない。新しい言語を追加する時は`STRINGS`の`settingsLanguageRowTitle`にもその言語の「言語」を意味する単語を追記すること。

### 新しい言語を追加する時の手順（3言語目以降を追加する時のプレイブック）

英語対応を一通り終えた際に確立した手順。**韓国語（`ko`）・繁体字中国語（台湾、`zh-TW`）・スペイン語（`es`）・ポルトガル語（`pt`）・ベトナム語（`vi`）・タイ語（`th`）・インドネシア語（`id`）はいずれもこの手順に沿って①〜③まで完了済み**（`zh-TW`は韓国語の完了後、`es`は`zh-TW`の完了後、`pt`は`es`の完了後、`vi`は`pt`の完了後、`th`は`vi`の完了後、`id`は`th`の完了後、それぞれ同じ手順をなぞって追加した）——現時点で当初計画していた5言語（es・pt・vi・th・id）はすべて完了。次に新しい言語を追加する時もこの順で進める。

**① Web/JS側（`src/app/components/I18n.tsx`）**

1. `export type Language = 'ja'|'en'|'ko';` に新しいコードを追加（例: `'ja'|'en'|'ko'|'zh-TW'`。ハイフンを含むコードはオブジェクトリテラルのプロパティ名としてクォートが必要）。`STRINGS[key][language]`という添字アクセスの型チェックにより、`STRINGS`の全項目に新言語のフィールドが無いとビルドが通らない（＝抜け漏れをコンパイル時に検出できる）ので、Language型を広げた直後に一度`npm run build`してエラー箇所を確認するとよい
2. `STRINGS`の全キーに新言語のフィールドを追加（韓国語・繁体字中国語どちらも約250項目、`ja,en,ko`の隣に新言語を1行で追記する形式に統一した）。翻訳の質は人力レビューが必要
3. `detectLanguage()`（端末言語からの自動判定フォールバック）を更新。新言語のロケールプレフィックス判定を追加する（`zh-TW`追加時は`ja`→`ko`の次に`zh`で始まる端末ロケールすべて＝簡体字ロケールも含めて`zh-TW`にフォールバックさせた。このアプリは簡体字非対応のため「近い言語の方が何も無いよりまし」という割り切り）。`getStoredLanguage()`のバリデーションにも新言語コードを追加すること（忘れるとlocalStorageに保存された値が無効値扱いされ`auto`に戻ってしまう）
4. `DAY_NAMES_EN`/`MONTH_NAMES_EN`のような言語別の固定配列（曜日名・月名）がある箇所は同様に新言語版配列を追加し、対応する`language==='ja'?...:...`の2値〜5値分岐をすべて対応する値数の分岐に書き換える（`page.tsx`内に散在しているため後述の監査grepで洗い出す）。曜日1文字の取得は`dayNameFor(language,i)`ヘルパー（`I18n.tsx`）に集約したので、新しい曜日表示を追加する時もこれを使うこと（月名は「数字+単位」型と「月ごとの固有名詞」型の2種類がある。日本語・韓国語・繁体字中国語・**ベトナム語**は「数字+単位」型で専用の名前配列を持たないため、月名だけの配列は英語版`MONTH_NAMES_EN`とスペイン語版`MONTH_NAMES_ES`とポルトガル語版`MONTH_NAMES_PT`と**タイ語版`MONTH_NAMES_TH`**と**インドネシア語版`MONTH_NAMES_ID`**のみ存在する。ja/ko/zh-TW側は呼び出し側で`${month+1}月`/`${month+1}월`/`${month+1}月`のように組み立て、ベトナム語も同型として`tháng ${month+1}`のように組み立てる（`MONTH_NAMES_VI`は用意していない）。スペイン語・ポルトガル語は英語と同じく月ごとに専用の単語（`enero`/`janeiro`等）を持つ言語なので、それぞれ専用配列を用意した。**タイ語も英語と同じく月ごとに専用の単語（`มกราคม`=1月等）を持つ言語なので`MONTH_NAMES_TH`を用意した**（ベトナム語と同じ東南アジアの言語でも型が異なる点に注意——言語系統や地域では判断できず、言語ごとに個別に確認が必要）。**インドネシア語も月ごとに専用の単語（`Januari`=1月等、ラテン語由来でスペイン語・ポルトガル語と似た綴り）を持つ言語なので`MONTH_NAMES_ID`を用意した**（同じ東南アジアの言語でもベトナム語は「数字+単位」型、タイ語・インドネシア語は「固有名詞」型と割れる。3言語とも個別に確認して初めて分かった）。新しい言語を追加する時、その言語が「数字+単位」型か「月ごとの固有名詞」型かをまず確認すること）
5. `DUR_OPTS`/`NOTIF_OPTS`/`DEADLINE_NOTIFY_OPTS`/`LATER_REMINDER_OPTS`/`APP_INACTIVITY_OPTS`のような選択肢配列、`THEMES`/`APP_ICONS`の色名・アイコン名（`name`/`nameEn`）にも新言語版（`zh-TW`は`_ZH_TW`サフィックス・`nameZhTw`）を追加し、対応箇所を分岐にする
6. `summarizeCustomRecEn`（カスタム繰り返しの要約文生成）のような言語別ロジック関数がある場合、同様の新言語版関数を追加し、呼び出し元（`recLabel()`等、`lang`引数を取る関数は`if(lang==='en')`ブロックの並びに新言語の分岐を追加する形）を更新する
7. 設定 → 表示設定 → 言語ピッカー画面（`sub==='language'`）の選択肢配列と、「言語 / Language / 언어 / 語言」固定ヘッダー文字列（`subHeader`呼び出し・`SettingsRow`の`title`の両方）に新言語を追加する
8. **区切り文字（`'・'`/`'、'`のような日本語専用の記号）が`language==='ja'?区切り記号:', '`という2値分岐になっている箇所は、新言語がラテン文字圏の区切り（`', '`）と同じでよいなら追加のコードは不要**（`language!=='ja'`の`else`枝に自然に含まれる）。韓国語はこのパターンでコード変更なしに正しく動いたが、**繁体字中国語は日本語と同じ全角句読点圏なので、逆に`(lang==='ja'||lang==='zh-TW')?区切り記号:...`のように明示的にzh-TWを含める必要があった**（`GeofencePlugin.swift`の買い物リスト場所通知・忘れ物防止アラートの区切り文字判定で発生。新言語がラテン文字圏かCJK圏かで対応が逆になる点に注意）
9. **教訓（韓国語のQAパスで発覚、繁体字中国語では実装と同時に先回りして対応済み）**: モジュール共通の`language`変数ではなく`lang`という引数名を取る関数（`deadlineRemainLabel(deadlineAt,lang)`・`durLabel(m,lang)`）や、`language==='en'`のように非デフォルト言語を直接チェックする独立したローカル関数（`SearchPage`内の`fmtDate`・`TaskModal`内の`taskDateLabel`）は、`grep "language==='ja'"`だけの監査網では見つからない。新しい言語を追加する時は`grep ":\s*Language(\s*=|\))"`で`Language`型パラメータを取る関数を明示的に洗い出し、実装と同時にこれらにも新言語の分岐を追加すること（QAで見つけ直すのは二度手間になる）

**② 抜け漏れを探す監査手順（このセッションで確立した実践的な方法）**

新しい言語を追加する時も、英語対応の時と同じく「まず機械的にgrepで候補を絞り込み、1件ずつ目視で本当に直訳が必要か判断する」のが最も漏れが少ない。

```bash
grep -n "[ぁ-んァ-ヶ一-龯]" src/app/page.tsx | grep -v "tr(" | grep -v "language===" | grep -vE "^\s*[0-9]+:\s*//" | grep -vE "\{/\*.*\*/\}"
```

- 除外すべき定番の false positive: JSXコメント（`{/* ... */}`）、型定義や定数の直後に付いたJSコメント、すでに`language==='ja'?...:...`で分岐済みの行、`DAY_NAMES`のような配列定義自体（表示側は別途分岐している）、`defaultIconKey`のように英語キーワード込みの正規表現で既に両対応している判定関数
- 見つけた候補は「実際にユーザーに見える文言か」「別のヘルパー関数/変数を経由してすでに翻訳済みか」を1つずつ確認してから直す。機械的な一括置換はしない
- **よく見落とされるカテゴリ**（実際に今回の監査で見つかった例。新しい言語を追加する時も同じ場所に抜けが残っている可能性が高い）:
  - 独立コンポーネント化された小さいUI（アイコンピッカー、地図ピッカー、PROペイウォールシート、忘れ物防止アラートパネル等）— `useI18n()`自体を呼んでいないコンポーネントがあり、`tr`/`language`がそもそもスコープに無いことがある
  - モーダル内の確認ダイアログ・ポップアップ系（削除確認・変更確認・キャンセルボタン等）— 本体画面は翻訳済みでも、そこから開く確認ポップアップだけ後から追加されて翻訳が漏れているパターンが多い
  - 機能追加時にコピペで作られた画面（例: 一括登録機能の履歴編集シートが、元のアイコンシートをコピペして作られておりtr()が付いていなかった）
  - ドラッグ&ドロップ中に一時的に表示されるラベル（「削除する」「ドラッグして配置」等）
  - PROゲート時に表示される機能名（`setProPrompt('機能名')`のように呼び出し側でベタ書きされた説明文。呼び出し箇所が20箇所近く散らばっているため見落としやすい）

`ICON_CATEGORIES`（アイコン選択画面のカテゴリ見出し・約90件の個別アイコン名）にも`labelKo`・`labelZhTw`・`labelEs`・`labelPt`・`labelVi`・`labelTh`・`labelId`を追加済み（該当する3箇所（アイコンシート・一括入力のアイコン変更・生活パターンのアイコン変更）の分岐を9値化した）。アイコン検索（`iconQuery`）も`labelKo`/`labelZhTw`/`labelEs`/`labelPt`/`labelVi`/`labelTh`/`labelId`を含めてマッチするようにしてある。**「기타」が「ギター（楽器）」と「その他」の両方の訳語になっている**（趣味・スポーツカテゴリの`guitar`アイコンは表記揺れを避けて`기타(악기)`にしている）——これは韓国語の同綴同音異義語で、既存のUIパターン（各アイコンは実際のグラフィックと一緒に表示される）で実用上は問題にならない。

**`defaultIconKey(name)`（タスク名の文字列からアイコンを自動判定する関数、`page.tsx`冒頭付近）は、es/pt/vi/th/id追加時に見落としていた漏れだった。** ja/en/ko/zh-TWのキーワード（正規表現）は最初から入っていたが、その後の5言語追加時の手順❶〜❹（`STRINGS`・`detectLanguage`・配列・`ICON_CATEGORIES`等）にこの関数が含まれておらず、後日「タスク名を入れたらアイコンが変わる機能が他言語で動かない」という指摘で発覚し追加対応した。全カテゴリ（食事・運動・仕事・買い物等、約30分岐）それぞれにes/pt/vi/th/idのキーワードを追加している。**ラテン文字圏の言語（es/pt/vi/id）はアクセント記号付き文字が英語版で使っている`\b...\b`単語境界と相性が悪い**（JSの正規表現の`\b`はASCIIの`\w`基準で判定するため、`café`の`é`のような非ASCII文字の直後では単語境界として機能しないことがある）。そのため既存のja/ko/zh-TWと同じ「`\b`を使わない`/i`フラグのみの部分一致」方式にしてある（thは大文字小文字の区別が無い言語なので`/i`も不要）。**動詞と名詞で語形が変わる単語（スペイン語の`desayuno`(名詞)/`desayunar`(動詞)、`almuerzo`/`almorzar`、ポルトガル語の`almoço`/`almoçar`等）は、部分一致だけでは動詞形を拾えないため両方を明示的にキーワードへ追加する必要がある**（実際に「Desayunar」がどのカテゴリにも一致しない不具合として発覚した）。**新しい言語を追加する時は、この`defaultIconKey`の全分岐にもキーワードを追加することを新言語追加チェックリストに含めること。**

**ヘッダーの「空き時間」トグルボタンの幅は、以前は`width:language==='ja'?'84px':...`のように言語ごとに固定pxを手で調整していたが、この方式は新しい言語を追加するたびに専用の値を用意し、かつPlaywrightで実機幅を確認しないと「トグル自身がはみ出る」「日付タイトルと近すぎる」「反対にヘッダーのカレンダー・検索・設定アイコンが画面外に押し出される」の3種類の不具合を繰り返し踏むことになった（スペイン語・ポルトガル語・ベトナム語それぞれで実際に発生）。最終的に固定px方式自体を廃止し、ボタン内のラベル`<span>`を`position:absolute`ではなく通常のフロー要素に戻すことで、ボタンの幅が中の文字数に応じて自動的に決まる（`width`を指定しない）方式に作り直した。** ノブ（丸いつまみ）は従来通り`left:calc(100% - 22px)`/`'6px'`の絶対配置のままでよい——`calc(100%...)`のパーセント計算は親要素の実際の算出幅を参照するため、幅が固定pxでも中身に応じた自動幅でも同じロジックがそのまま機能する。**新しい言語の`headerFreeTimeToggle`（または同様の可変長トグル）を追加する時は、専用のpx幅を用意しようとせず、まずこの自動幅方式で足りるか確認すること。**

日付タイトル側（ヘッダー最上段の年月表示）には、上記のトグル幅問題とは別に、フルスペルの月名＋連結語（例: スペイン語"septiembre de 2026"、ベトナム語"Tháng 9, 2026"）が長すぎてヘッダー行のカレンダー・検索・設定アイコンを画面外に押し出す不具合が実際に発生した。修正: ① es/ptは英語と同じ`.slice(0,3)`方式で月名を3文字に短縮し`de`連結子を削除（例:"Sep 2026"）、viは`` `T${month} ${year}` ``（例:"T9 2026"）、idも`.slice(0,3)`（例:"Sep 2026"、インドネシア語の月名はもともと英語と同じラテン語由来の綴りなので3文字略記がそのまま通じる）、thは`MONTH_NAMES_TH_SHORT`という専用の慣用短縮表記の配列（「ก.ย.」のようなタイ語の月の正式な略記、句点区切り2〜3文字。フルスペルの`MONTH_NAMES_TH`とは別に用意し、ヘッダーだけで使う）に短縮。② さらに根本対策として、日付タイトルの`<span>`に`truncate min-w-0`を、アイコン+トグルのグループに`shrink-0`を、親の`flex`コンテナに`gap-2`（当初`gap-3`にしていたが、インドネシア語で3px、タイ語で6pxだけ足りず省略記号が出てしまったため詰めた）を付けた。これにより**タイトルがどれだけ長くても、アイコン群は絶対に画面外へ押し出されず、必要ならタイトル側が省略記号で短縮される**（今後どの言語で同種の不具合が起きても、アイコンが消える最悪のケースだけは構造的に起きなくなる安全網）。**新しい言語のヘッダー表示を確認する時は、ヘッダー行のカレンダー・検索・設定アイコンが画面内に収まっているか（`header button`の`boundingBox()`が画面幅を超えていないか）を複数のiPhone幅（375/390/428px程度）でPlaywrightで確認すること。この安全網があるからといって、日付タイトルが省略され過ぎていないか（`truncate`で肝心の年月が消えていないか、`span.scrollWidth>span.clientWidth`で判定できる）の確認は省略しないこと。** なお375px（iPhone SEクラス）では一部言語（ko/es/pt/vi/id）で年の下2桁が省略されることがあるが、設定ボタン等の操作性には影響しないため許容している。

**③ ネイティブiOS側（Swift）**

- **ホーム画面ウィジェット**: `native-ios/Widgets/Localizable.xcstrings`（String Catalog）に新言語の翻訳を追加。**ウィジェットはアプリ内の言語設定ではなく端末本体のシステム言語（設定→一般→言語と地域）で自動的に切り替わる**（SwiftUIの`Text(_:LocalizedStringKey)`がOSのロケールを見るため、アプリ内`tl-language-v1`とは完全に独立）。確認時は端末のシステム言語を切り替えたあと、ホーム画面からウィジェットを一度削除して再追加する（キャッシュされたタイムラインが残ると反映されないことがある）
  - SwiftUIの罠: `Text(someStringVariable)`のように一度`String`型を経由すると自動ローカライズされない。`Text("リテラル")`か`LocalizedStringKey`型のパラメータ経由で渡すこと
  - **繁体字中国語（台湾）のString Catalogロケールキーは`"zh-TW"`ではなく`"zh-Hant-TW"`を使う**（Appleの文字体系＋地域を明示するロケール識別子の慣例。アプリ内`Language`型の値`'zh-TW'`とキー文字列が一致しないので、`appLanguage`側の値と混同しないこと——String Catalog側は完全にOSロケール任せで、`appLanguage`キーの値とは無関係）
- **バックグラウンドで発火するネイティブ通知**（`GeofencePlugin.swift`等、Swift側からJSの`tr()`を呼べない箇所）: JS側が`WidgetDataPlugin.updateWidgetData()`経由でApp Group共有の`UserDefaults`に`appLanguage`キー（`"ja"`/`"en"`/`"ko"`/`"zh-TW"`/`"es"`/`"pt"`/`"vi"`/`"th"`/`"id"`の生の言語コード文字列。こちらはアプリ内`Language`型の値そのものをそのまま書き込む）を書き込み、Swift側がこれを読んで判定している。**韓国語対応時に旧`isEnglish(): Bool`という二値ヘルパーを`appLang() -> AppLang`（`private enum AppLang { case ja, en, ko, zhTW, es, pt, vi, th, id }`。繁体字中国語対応時に`zhTW` case、スペイン語対応時に`es` case、ポルトガル語対応時に`pt` case、ベトナム語対応時に`vi` case、タイ語対応時に`th` case、インドネシア語対応時に`id` caseを追加済み）に置き換え済み。** 呼び出し側は`let lang = appLang()`のあと`switch lang { case .ja: ...; case .ko: ...; case .zhTW: ...; case .es: ...; case .pt: ...; case .vi: ...; case .th: ...; case .id: ...; case .en: ... }`で分岐する。10言語目を追加する時はこの`AppLang` enumに新しいcaseを追加し、`appLang()`のswitch文と各呼び出し箇所のswitch文（`GeofencePlugin.swift`内に7箇所: 買い物リストの場所通知2箇所・タスクの場所通知2箇所・忘れ物防止アラート3箇所）に新しいcaseを追加する
  - `ios/`はgitignore対象のため、Swiftファイルを編集した後は必ずXcode上で対象ファイルの中身を手動差し替える（新規ファイルはTarget Membership追加、既存ファイルは中身をコピペで上書き）

**④ 課金・価格表示**

- PRO価格は翻訳ではなく`Premium.tsx`の`priceString`（RevenueCatが`getOfferings()`で取得する、ストアフロント別にAppleが自動換算した価格文字列）を使っている。新しい言語を追加しても価格表示ロジックは無改修で動く（`priceString`は「言語」ではなく「地域・ストアフロント」に紐づくため）

**⑤ 確認・デプロイ**

- JS側の翻訳はPlaywrightで`localStorage.setItem('tl-language-v1', '<言語コード>')`をセットしてブラウザで検証できる（`npm install --no-save playwright-core`で一時的に入れ、確認後は`npm uninstall playwright-core`で必ず削除する）
- ネイティブ側（ウィジェット・バックグラウンド通知）はブラウザでは検証不可。実機でXcode再ビルド（Cmd+R）→端末のシステム言語を切り替え→ウィジェットを削除/再追加、まで行って確認する
- `npm run build`が通ることを毎回確認してからコミット・pushする（型エラーで気づけるケースが多い。特に`Language`型を拡張すると、3値分岐が漏れている`switch`/`if-else`チェーンがTSの型チェックで検出できることがある）

### 避けるパターン

- `I18n.tsx`の`STRINGS`に新しいキーを追加する時、対応言語の一部だけ埋めない（型は全言語必須になっているので忘れるとビルドエラーになるが、意味のある翻訳を入れずに同じ文字列を使い回さない）
- `page.tsx`側で翻訳関数を`t`という変数名で受け取らない（`tasks`/`tags`/`themes`等の`.map(t=>...)`ループ変数と衝突する。必ず`tr`のまま使う）
- 設定の「言語 / Language」行・ピッカー画面のヘッダー文言を`tr()`経由の動的翻訳に変えない（英語モード時に"Language / Language"のような重複が起きる。意図的な固定バイリンガル表記）
- 新しいコンポーネントを追加する時、`useI18n()`を呼び忘れて`tr`/`language`がスコープに無いまま日本語をベタ書きしない（独立コンポーネント化された小さいUIで実際に何度も発生した抜け漏れパターン）
- ウィジェットの文言をアプリ内`language`状態から制御しようとしない（ウィジェットは端末のシステム言語で決まる別レイヤー。String Catalogに委ねる）

---

## App Store Connect の英語対応（配信メタデータ、進行中）

アプリ本体（JS側UI）の英語対応は完了済みだが、**App Store Connect側の「英語（アメリカ）」ロケール（説明文・スクリーンショット等）は作業が難航し、一旦保留にした。** 次にこの続きをやる時のための記録。

### 静的ページ（利用規約・プライバシーポリシー・サポート）はja/en/ko/zh-TWとも用意済み

| 内容 | 日本語 | 英語 | 韓国語 | 繁体字中国語 |
|---|---|---|---|---|
| 利用規約 | `public/terms.html` | `public/terms-en.html` | `public/terms-ko.html` | `public/terms-zh-tw.html` |
| プライバシーポリシー | `public/privacy.html` | `public/privacy-en.html` | `public/privacy-ko.html` | `public/privacy-zh-tw.html` |
| サポート | `public/support.html` | `public/support-en.html` | `public/support-ko.html` | `public/support-zh-tw.html` |

App Store Connectの各ロケール設定でURLを入力する時、**英語ロケールなら必ず `-en.html` の方を使うこと。** `terms.html`のような無印のファイル名は日本語版なので、英語ロケールにそのまま使うと英語ユーザーに日本語ページが表示されてしまう（実際に説明文のURLで`terms.html`のまま貼ろうとしていて気づいた）。

### 英語版App Store説明文・キーワード・バージョンの最新情報（下書き済み）

説明文は本文中で確定済み（"Clear your mind."から始まる長文、利用規約リンクは`terms-en.html`）。キーワード欄（100文字以内）は以下で確定:

```
adhd,task,todo,planner,reminder,schedule,timeline,deadline,forgetful,shift,routine,focus,checklist
```

バージョン1.0.7のリリースノート（英語）:

```
Clear your mind and stay on top of everything new in this update:

・Product tour — a guided walkthrough for first-time users
・Deadline management — set due dates and reminders for your tasks
・Location reminders for "Later" tasks — get notified when you arrive somewhere
・Don't-forget alerts — check what to bring when you head out
・Added LINE as a new contact option
・Added English language support (Settings → Display → Language)
・Choose from 4 text sizes (Small, Standard, Large, Extra Large)
・Choose whether the week starts on Sunday or Monday

Plus various small bug fixes.
```

### 既知の不具合: 英語ロケール追加時にスクリーンショットが保存できない

英語（アメリカ）ロケールを追加後、6.5インチスクリーンショットをアップロードして「保存」しても「スクリーンショットまたはプレビューをアップロードする前に、新しいロケールを保存してください」という警告が繰り返し出て先に進めない、という不具合に遭遇した。

切り分けで確認したが原因ではなかったもの:
- 画像の透過（JPEGなので透過は無い）
- 画像サイズ（`1242×2688`px ぴったりで規定通り）
- カラーモデル（sRGB、DPI 96で問題なし）

最終的に、**画像ファイル名に日本語・全角記号・スペースが含まれていた**（例:「頭の中を空っぽに。英語用 - 2.jpg」）ことが有力な原因と判断し、`screenshot-1.jpg`のような半角英数字のみのファイル名にリネームしてから再アップロードしたところ警告が解消した。**新しくApp Store Connectにスクリーンショット等をアップロードする時は、最初から半角英数字のファイル名にしておくこと。**（他にも「保存」ボタンが赤い＝単に未保存の変更があるだけで異常ではない、という基本挙動を何度か再確認する場面があった。赤色自体はエラーの意味ではない）

### 現状（1.0.14時点）: 英語・韓国語・繁体字中国語ロケールは追加済み

上記のスクリーンショット不具合を解消した後、**英語（アメリカ）・韓国語・中国語（繁体字）のApp Store Connectロケールはすでに追加・公開済み**になっている（1.0.7時点は「日本語のみで先に提出」という一時的な方針だったが、それ以降のアップデートでこの3ロケールを追加した）。上記の下書きテキスト・キーワード・修正済みURLは英語ロケール追加時にそのまま使用済みのもの。

**スペイン語・ポルトガル語・ベトナム語・タイ語・インドネシア語（アプリ内UIとして対応済みの5言語）のApp Store Connectロケールはまだ追加していない。** アプリ内表示は端末の言語設定で自動的に切り替わる（またはアプリ内で手動選択）ため、ストア掲載ロケールを追加しなくてもこれらの言語のユーザーは問題なくアプリ内UIを使える。ストア掲載ページ（説明文・スクリーンショット）まで多言語化するかは別途の判断で、現時点では対応不要という方針。

**新しいバージョンをリリースする時は、日本語（プライマリ）に加えて、すでに公開済みの英語・韓国語・繁体字中国語ロケールにも同じ内容のリリースノート（「このバージョンの新機能」）を入れること。** 日本語だけ更新すると、英語・韓国語・繁体字中国語ユーザー向けのストアページだけ古いリリースノートのまま公開され続けてしまう。

### 配信対象からEU圏（フランス含む）を意図的に除外している

**App Store Connectの配信国・地域設定で、フランスを含むEU加盟国は意図的に配信対象から外している。** JS/UI側でスペイン語・ポルトガル語等の多言語対応を進めているのとは別軸の話で、翻訳の有無とは無関係。

理由: EUでアプリを配信する場合、DSA（デジタルサービス法）により、課金機能があるアプリの開発者は「Trader（事業者）」として扱われる可能性があり、その場合App Store上に住所・電話番号・メールアドレスを公開する必要が生じる。個人開発でこれらの個人情報を公開するのは避けたいため、当面EU圏（フランス含む）は配信対象外にする方針にしている。

**新しいセッションで「EU圏だけ配信対象から外すのは一貫性がなく意味がないのでは」と提案しない・除外を解除しない。** この除外はDSAのTrader開示要件を回避するための意図的な判断であり、他の非対応言語圏（英語表示にフォールバックする国）への配信継続とは矛盾しない別の理由に基づく。

---

## 開発者モード（検証用の隠しメニュー）

一般ユーザーには表示されない検証用のメニュー。設定画面の「アプリバージョン」行を**7回タップ**すると解放され、以後「開発者向け」セクションに「開発者モード」の行が常に表示されるようになる（`localStorage`の`DEV_MODE_UNLOCKED_KEY`で永続化。一度解放したら再度タップし直す必要はない）。

**方針: RevenueCatや実際のOS権限を変更するのではなく、UI上の判定結果だけを一時的に上書きする。** 本物の購入処理をしたり実機の設定アプリを操作したりせずに、開発中によく確認したい状態（Free/Premium表示・初回起動・プロダクトツアー・権限拒否時の表示）を素早く再現するための機能。

### 実装（`src/app/components/DevMode.ts`）

localStorageキーとヘルパー関数を集約した薄いファイル。他のファイルから見た「上書きの窓口」はこれだけ。

```typescript
DEV_MODE_UNLOCKED_KEY      // 開発者モードが解放済みか
DEV_PREMIUM_OVERRIDE_KEY   // ''|'free'|'premium'（プランの上書き）
DEV_LOCATION_DENIED_KEY    // 位置情報を拒否済みとして扱うか
DEV_NOTIF_DENIED_KEY       // 通知を拒否済みとして扱うか
DEV_PREMIUM_CHANGED_EVENT  // プラン上書きの変更をPremiumProviderに即時反映させるためのカスタムイベント名
```

- **プラン**: `Premium.tsx`の`PremiumProvider`が`getDevPremiumOverride()`を読み、`devOverride`が設定されていれば実際の`isPremium`計算結果より優先する（`effectiveIsPremium = devOverride ? devOverride==='premium' : isPremium`）。`setDevPremiumOverride()`は`localStorage`更新後に`DEV_PREMIUM_CHANGED_EVENT`を発火し、`PremiumProvider`はこれをlistenしてリロード無しで即座に反映する
- **権限（通知・位置情報）**: `Geofence.ts`の`checkGeofencePermissions()`/`ensureGeofencePermission()`の先頭で`devPermissionOverride()`を確認し、どちらかの拒否フラグが立っていれば実際のネイティブ呼び出し・Web既定値より優先して`'denied'`/`false`を返す。これにより`ShopLocationPanel`の権限拒否バナー等、実際の権限確認ロジックを使う画面がそのまま正しく反応する
- **初回起動・プロダクトツアー**: `SettingsScreen`内の`toggleFirstLaunch()`/`toggleTour()`が`WAKESLEEP_ASKED_KEY`等の初回起動関連キーを直接読み書きし、**`window.location.reload()`で即座に反映する**（これらのフラグはApp起動時の`useEffect`で一度だけ読まれる設計のため、リロードしないと反映されない）。「初回起動」をOFFにすると`WAKESLEEP_ASKED_KEY`/`TOUR_COMPLETED_KEY`/`NOTIF_ASKED_KEY`/`LOCATION_ASKED_KEY`をまとめてクリアし、プロダクトツアーから全ての導線をやり直せる。「プロダクトツアー」は`TOUR_COMPLETED_KEY`のみを対象にする

### 避けるパターン

- 開発者モードから実際にRevenueCatの購入処理を呼んだり、実際のOS権限ダイアログを操作しようとしない（見た目の上書きのみに留める設計）
- `DevMode.ts`のキーを他のファイルに文字列としてベタ書きしない（`Premium.tsx`/`Geofence.ts`/`page.tsx`すべて`DevMode.ts`からimportする）
- 一般ユーザーが誤って踏まないよう、7回タップ以外の導線（メニュー項目など）を新設しない

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

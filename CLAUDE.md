# CLAUDE.md

## Project

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- GitHub管理
- Vercelデプロイ（main ブランチへの push で自動デプロイ）

作業完了時は必ず以下を順に実施する：

1. `npm run lint`
2. `npm run build`
3. Git commit
4. `git push origin main`（Vercel 本番デプロイ）

説明より実装を優先する。必要なら関連ファイルを自分で調査して進める。

---

## Development

修正方針の長い説明より実装を優先する。

必要なら関連ファイルを自分で調査する。

作業完了時は必ず以下を報告する：

- 修正したファイル
- 実装内容
- lint 結果
- build 結果
- commit ID
- デプロイ URL

---

## プロジェクト概要

**1日タイムライン** — ADHD気質の人やToDoリストが続かない人向けに、今日やることを時間軸で見える化するタイムラインToDoアプリ。

- フレームワーク: Next.js 15 (App Router)
- 言語: TypeScript
- スタイル: Tailwind CSS
- アイコン: @phosphor-icons/react（weight="bold"、AppIcons で一元管理）
- AI: Groq SDK（llama-3.3-70b-versatile）※Threads投稿生成機能で使用
- データ永続化: localStorage（サーバーDBなし）

## ディレクトリ構成

```
src/app/
  page.tsx              # アプリ全体のメイン実装（タイムライン・タスク管理）
  layout.tsx            # ルートレイアウト・メタデータ
  globals.css           # グローバルスタイル
  components/
    Icons.tsx           # AppIcons — Phosphor Icons の一元管理
  api/
    generate/
      route.ts          # Groq APIを使ったThreads投稿生成エンドポイント
```

## 主要な型定義（page.tsx）

| 型 | 説明 |
|---|---|
| `Task` | タスクの主データ（id, name, startTime, duration, memo, icon, completed, date, isLater, recurrence など） |
| `Settings` | 起床・就寝時間の設定 |
| `FreeSlot` | タイムライン上の空き時間スロット |
| `ShopItem` | 買い物リストのアイテム |
| `CustomRec` | カスタム繰り返し設定 |
| `TaskMode` | `'later'` / `'scheduled'` / `'recurring'` |

## 主要な定数（page.tsx）

| 定数 | 値 | 説明 |
|---|---|---|
| `PX_PER_HOUR` | 40 | タイムライン1時間あたりのピクセル高さ |
| `TASKS_KEY` | `'tl-tasks-v2'` | localStorage キー（タスク） |
| `SETTINGS_KEY` | `'tl-settings-v2'` | localStorage キー（設定） |
| `SHOP_KEY` | `'tl-shop-v1'` | localStorage キー（買い物リスト） |

## 開発コマンド

```bash
npm run dev     # 開発サーバー起動（http://localhost:3000）
npm run build   # 本番ビルド
npm run lint    # ESLint
```

## 環境変数

| 変数 | 説明 |
|---|---|
| `GROQ_API_KEY` | Groq APIキー（Threads投稿生成機能で使用） |

## アイコン方針

- ライブラリ: `@phosphor-icons/react`
- weight: `"bold"` をデフォルト
- サイズ: 20px 前後（用途により 10〜40px）
- 管理: `src/app/components/Icons.tsx` の `AppIcons` オブジェクトで一元管理
- 画面内（page.tsx など）に Phosphor を直接 import しない

### AppIcons キー一覧

| キー | Phosphor コンポーネント | 用途 |
|---|---|---|
| `calendar` | CalendarBlank | ヘッダー カレンダーボタン |
| `search` | MagnifyingGlass | ヘッダー 検索ボタン・検索バー |
| `settings` | Gear | ヘッダー 設定ボタン |
| `wake` | SunHorizon | タイムライン 起床カード |
| `sleep` | Moon | タイムライン 就寝カード |
| `task` | NotePencil | タスクアイコン編集ボタン |
| `freeTime` | ClockCountdown | 空き時間カード |
| `repeat` | ArrowsClockwise | 繰り返しラベル・セクション |
| `shopping` | ShoppingCart | 買い物リスト空状態 |
| `postponed` | ArrowCounterClockwise | 未完了回数インジケーター |

---

## 開発上の注意

- タイムライン機能はほぼ `src/app/page.tsx` に集約されている（単一ファイル構成）
- スマートフォン最適化済み（`userScalable: false`、`overscroll-none`）
- データはすべてブラウザの localStorage に保存（サーバー不要）
- Groq APIはThreads投稿生成のみに使用しており、タイムライン機能とは独立している

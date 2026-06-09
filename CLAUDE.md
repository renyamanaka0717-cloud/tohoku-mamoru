# CLAUDE.md

## プロジェクト概要

**1日タイムライン** — ADHD気質の人やToDoリストが続かない人向けに、今日やることを時間軸で見える化するタイムラインToDoアプリ。

- フレームワーク: Next.js 15 (App Router)
- 言語: TypeScript
- スタイル: Tailwind CSS
- AI: Groq SDK（llama-3.3-70b-versatile）※Threads投稿生成機能で使用
- データ永続化: localStorage（サーバーDBなし）

## ディレクトリ構成

```
src/app/
  page.tsx          # アプリ全体のメイン実装（タイムライン・タスク管理）
  layout.tsx        # ルートレイアウト・メタデータ
  globals.css       # グローバルスタイル
  api/
    generate/
      route.ts      # Groq APIを使ったThreads投稿生成エンドポイント
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

## 開発上の注意

- タイムライン機能はほぼ `src/app/page.tsx` に集約されている（単一ファイル構成）
- スマートフォン最適化済み（`userScalable: false`、`overscroll-none`）
- データはすべてブラウザの localStorage に保存（サーバー不要）
- Groq APIはThreads投稿生成のみに使用しており、タイムライン機能とは独立している

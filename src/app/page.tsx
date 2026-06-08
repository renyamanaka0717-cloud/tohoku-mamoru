'use client'
// page.tsx: アプリのメイン画面。入力フォームと結果表示を担当します。
// 'use client' → ユーザーの操作（ボタンクリックなど）を受け取るために必要な宣言

import { useState } from 'react'

// --------- 型の定義（TypeScript用）---------
// AIから返ってくるデータの形を定義しています
type GeneratedResult = {
  ideas: string[]          // 投稿ネタ30個
  angles: string[]         // 伸びやすい切り口10個
  hooks: string[]          // 冒頭文フック20個
  posts: string[]          // そのまま使える投稿文20個
  questions: string[]      // コメントがつきやすい質問文10個
  profileTexts: string[]   // プロフィール誘導文10個
  hashtags: string[]       // ハッシュタグ案20個
}

// 投稿目的の選択肢リスト
const PURPOSE_OPTIONS = [
  'フォロワーを増やす',
  '商品・サービスを売る',
  '共感を集める',
  '相談・問い合わせにつなげる',
  '専門家としての信頼を作る',
  'イベント・キャンペーンを告知する',
]

export default function Home() {
  // --------- 状態管理（画面に表示するデータ）---------
  const [keyword, setKeyword] = useState('')        // キーワード
  const [target, setTarget] = useState('')          // ターゲット
  const [purpose, setPurpose] = useState(PURPOSE_OPTIONS[0]) // 投稿目的
  const [result, setResult] = useState<GeneratedResult | null>(null) // AI結果
  const [loading, setLoading] = useState(false)    // ローディング中かどうか
  const [error, setError] = useState('')           // エラーメッセージ
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null) // コピー状態

  // --------- ネタ発掘ボタンを押した時の処理 ---------
  const handleGenerate = async () => {
    // 入力チェック
    if (!keyword.trim()) {
      setError('キーワードを入力してください')
      return
    }
    if (!target.trim()) {
      setError('ターゲットを入力してください')
      return
    }

    setError('')
    setLoading(true)
    setResult(null)

    try {
      // APIルートにデータを送信（サーバーを経由してClaude APIを呼び出す）
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, target, purpose }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'エラーが発生しました')
      }

      const data = await response.json()
      setResult(data)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : '通信エラーが発生しました。もう一度お試しください。'
      )
    } finally {
      setLoading(false)
    }
  }

  // --------- テキストをクリップボードにコピーする処理 ---------
  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedIndex(id)
    // 2秒後に「コピーしました」表示を消す
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  // --------- 結果セクションを表示するコンポーネント ---------
  const ResultSection = ({
    title,
    emoji,
    items,
    sectionKey,
  }: {
    title: string
    emoji: string
    items: string[]
    sectionKey: string
  }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
      <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
        <span className="text-2xl">{emoji}</span>
        {title}
        <span className="ml-auto text-sm font-normal text-gray-400">
          {items.length}件
        </span>
      </h2>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex items-start justify-between gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <div className="flex gap-2 min-w-0">
              <span className="text-gray-400 text-sm mt-0.5 shrink-0 w-5 text-right">
                {i + 1}.
              </span>
              <span className="text-sm text-gray-700 whitespace-pre-wrap break-words min-w-0">
                {item}
              </span>
            </div>
            <button
              onClick={() => handleCopy(item, `${sectionKey}-${i}`)}
              className="shrink-0 px-3 py-1 text-xs rounded-lg border border-gray-200 text-gray-500 hover:bg-white hover:border-purple-300 hover:text-purple-600 transition-all"
            >
              {copiedIndex === `${sectionKey}-${i}` ? '✓ コピー済み' : 'コピー'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )

  // --------- 画面の描画 ---------
  return (
    <main className="min-h-screen bg-gradient-to-b from-purple-50 to-white">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
              <span className="text-white text-xl">✦</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Threadsネタ発掘ツール
              </h1>
              <p className="text-xs text-gray-500">
                AIがあなたのThreads投稿ネタを提案します
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* 入力フォームカード */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
          <h2 className="text-base font-semibold text-gray-700 mb-5">
            投稿ネタを発掘する
          </h2>

          {/* キーワード入力 */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              キーワード
              <span className="text-red-400 ml-1">*</span>
            </label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="例：副業、ダイエット、ハンドメイド、節約"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent transition"
            />
            <p className="mt-1 text-xs text-gray-400">
              あなたが発信したいテーマやジャンルを入力してください
            </p>
          </div>

          {/* ターゲット入力 */}
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              ターゲット（対象読者）
              <span className="text-red-400 ml-1">*</span>
            </label>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="例：副業初心者、子育て中のママ、ハンドメイド作家"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-transparent transition"
            />
            <p className="mt-1 text-xs text-gray-400">
              誰に向けた投稿にしたいか入力してください
            </p>
          </div>

          {/* 投稿目的の選択 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              投稿の目的
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PURPOSE_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setPurpose(opt)}
                  className={`text-left text-sm px-4 py-3 rounded-xl border transition-all ${
                    purpose === opt
                      ? 'border-purple-400 bg-purple-50 text-purple-700 font-medium'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* エラーメッセージ */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {error}
            </div>
          )}

          {/* 発掘ボタン */}
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all shadow-md disabled:opacity-60 disabled:cursor-not-allowed text-base"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                AIが考え中です（10〜30秒かかります）
              </span>
            ) : (
              '✦ ネタを発掘する'
            )}
          </button>
        </div>

        {/* 結果表示エリア */}
        {result && (
          <div>
            {/* 結果のサマリー */}
            <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl border border-purple-100">
              <p className="text-sm text-purple-700 font-medium text-center">
                ✨ 「{keyword}」×「{target}」×「{purpose}」でネタを発掘しました！
              </p>
              <p className="text-xs text-purple-500 text-center mt-1">
                各テキストの右にある「コピー」ボタンでそのまま使えます
              </p>
            </div>

            <ResultSection
              title="Threads投稿ネタ"
              emoji="💡"
              items={result.ideas}
              sectionKey="ideas"
            />
            <ResultSection
              title="伸びやすい切り口"
              emoji="📐"
              items={result.angles}
              sectionKey="angles"
            />
            <ResultSection
              title="冒頭文フック（最初の一文）"
              emoji="🪝"
              items={result.hooks}
              sectionKey="hooks"
            />
            <ResultSection
              title="そのまま使える投稿文"
              emoji="📝"
              items={result.posts}
              sectionKey="posts"
            />
            <ResultSection
              title="コメントがつきやすい質問文"
              emoji="💬"
              items={result.questions}
              sectionKey="questions"
            />
            <ResultSection
              title="プロフィール誘導文"
              emoji="👤"
              items={result.profileTexts}
              sectionKey="profileTexts"
            />
            <ResultSection
              title="ハッシュタグ案"
              emoji="#️⃣"
              items={result.hashtags}
              sectionKey="hashtags"
            />

            {/* もう一度ボタン */}
            <div className="text-center mt-2 mb-8">
              <button
                onClick={() => {
                  setResult(null)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className="text-sm text-purple-500 underline hover:text-purple-700"
              >
                別のキーワードで発掘する
              </button>
            </div>
          </div>
        )}

        {/* フッター */}
        <footer className="text-center text-xs text-gray-400 py-6">
          <p>Threadsネタ発掘ツール — Powered by Claude AI</p>
          <p className="mt-1">
            このツールはAIが生成するコンテンツを提案するものです。投稿前に内容をご確認ください。
          </p>
        </footer>
      </div>
    </main>
  )
}

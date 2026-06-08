'use client'
import { useState } from 'react'

type Result = {
  patterns: string[]      // バズる投稿の特徴・パターン
  examples: string[]      // バズった投稿の例（AI生成）
  posts: string[]         // そのまま使える投稿文10個
  hooks: string[]         // 冒頭フック5個
  hashtags: string[]      // ハッシュタグ10個
}

export default function Home() {
  const [keyword, setKeyword] = useState('')
  const [target, setTarget] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!keyword.trim()) { setError('キーワードを入力してください'); return }
    if (!target.trim()) { setError('ターゲットを入力してください'); return }
    setError(''); setLoading(true); setResult(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, target }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setResult(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const Section = ({ title, emoji, items, id }: { title: string; emoji: string; items: string[]; id: string }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-5">
      <h2 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
        <span className="text-xl">{emoji}</span>{title}
        <span className="ml-auto text-xs font-normal text-gray-400">{items.length}件</span>
      </h2>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start justify-between gap-3 p-3 bg-gray-50 rounded-xl">
            <div className="flex gap-2 min-w-0">
              <span className="text-gray-400 text-sm shrink-0 w-4">{i + 1}.</span>
              <span className="text-sm text-gray-700 whitespace-pre-wrap break-words">{item}</span>
            </div>
            <button
              onClick={() => handleCopy(item, `${id}-${i}`)}
              className="shrink-0 px-2 py-1 text-xs rounded-lg border border-gray-200 text-gray-400 hover:text-purple-600 hover:border-purple-300 transition-all"
            >
              {copied === `${id}-${i}` ? '✓' : 'コピー'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <main className="min-h-screen bg-gradient-to-b from-purple-50 to-white">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-sm">T</span>
          </div>
          <div>
            <h1 className="font-bold text-gray-900">Threadsバズ分析ツール</h1>
            <p className="text-xs text-gray-400">AIがバズパターンを分析してそのまま使える文章を作成</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* 入力フォーム */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              ジャンル・キーワード <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="例：副業、ダイエット、ハンドメイド、節約"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 transition"
            />
          </div>
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              ターゲット読者 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder="例：副業初心者、子育て中のママ、20代会社員"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 transition"
            />
          </div>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
          )}
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:opacity-90 transition shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
                バズパターンを分析中...（10〜20秒）
              </span>
            ) : '🔍 バズパターンを分析する'}
          </button>
        </div>

        {/* 結果 */}
        {result && (
          <>
            <div className="mb-5 p-4 bg-purple-50 rounded-2xl border border-purple-100 text-center">
              <p className="text-sm text-purple-700 font-medium">
                「{keyword}」×「{target}」のバズパターンを分析しました
              </p>
              <p className="text-xs text-purple-400 mt-1">右の「コピー」ボタンでそのまま使えます</p>
            </div>

            <Section title="バズる投稿の特徴・パターン" emoji="📊" items={result.patterns} id="patterns" />
            <Section title="バズった投稿の例" emoji="🔥" items={result.examples} id="examples" />
            <Section title="そのまま使える投稿文" emoji="✍️" items={result.posts} id="posts" />
            <Section title="冒頭フック（最初の一文）" emoji="🪝" items={result.hooks} id="hooks" />
            <Section title="ハッシュタグ" emoji="#️⃣" items={result.hashtags} id="hashtags" />

            <div className="text-center mt-2 mb-8">
              <button
                onClick={() => { setResult(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                className="text-sm text-purple-400 underline hover:text-purple-600"
              >
                別のキーワードで分析する
              </button>
            </div>
          </>
        )}

        <footer className="text-center text-xs text-gray-400 py-4">
          <p>Threadsバズ分析ツール — Powered by Groq AI</p>
          <p className="mt-1">AIが生成するコンテンツです。投稿前に内容をご確認ください。</p>
        </footer>
      </div>
    </main>
  )
}

// layout.tsx: アプリ全体の共通レイアウト（タイトルやフォントの設定）
import type { Metadata } from 'next'
import './globals.css'

// ブラウザのタブに表示されるタイトルと説明
export const metadata: Metadata = {
  title: 'Threadsネタ発掘ツール | AIがあなたの投稿ネタを提案',
  description:
    'キーワードを入力するだけで、Threads向けの投稿ネタ・投稿文・切り口をAIが自動生成します。',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className="bg-white text-gray-800 antialiased">{children}</body>
    </html>
  )
}

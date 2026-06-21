import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
import { PremiumProvider } from './components/Premium'

export const metadata: Metadata = {
  title: '1日タイムライン | 今日のやることを見える化',
  description: 'ADHD気質の人や、ToDoリストが続かない人向けに、今日やることを時間軸で見える化するタイムラインToDoアプリ。',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 text-gray-900 antialiased overscroll-none">
        <Script src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js" strategy="afterInteractive"/>
        <PremiumProvider>
          {children}
        </PremiumProvider>
      </body>
    </html>
  )
}

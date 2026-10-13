/** @type {import('next').NextConfig} */
const isNativeBuild = process.env.BUILD_TARGET === 'ios' || process.env.BUILD_TARGET === 'android'

const nextConfig = {
  ...(isNativeBuild && {
    output: 'export',
    distDir: 'out',
    trailingSlash: true,
  }),
  // 独自ドメイン getbrainbox.app（apex）でアクセスされた時だけ公式サイト（landing.html）を返す。
  // app.getbrainbox.app・brainbox-app.vercel.appは従来通りアプリ本体（page.tsx）。
  // 静的書き出し（output:'export'、iOS/Android向け）ではrewritesが使えないため除外する
  ...(!isNativeBuild && {
    async rewrites() {
      return [
        { source: '/', has: [{ type: 'host', value: 'getbrainbox.app' }], destination: '/landing.html' },
      ]
    },
  }),
}

module.exports = nextConfig

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.BUILD_TARGET === 'ios' && {
    output: 'export',
    distDir: 'out',
    trailingSlash: true,
  }),
}

module.exports = nextConfig

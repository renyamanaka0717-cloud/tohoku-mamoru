/** @type {import('next').NextConfig} */
const nextConfig = {
  ...((process.env.BUILD_TARGET === 'ios' || process.env.BUILD_TARGET === 'android') && {
    output: 'export',
    distDir: 'out',
    trailingSlash: true,
  }),
}

module.exports = nextConfig

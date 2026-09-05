import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()' },
]

const config: NextConfig = {
  distDir: process.env.NEXT_BUILD_DIR || '.next',
  poweredByHeader: false,
  reactStrictMode: true,
  // Existing public images are served unchanged, without an image transformation subscription.
  images: { unoptimized: true },
  async headers() {
    return [{ source: '/:path*', headers: [
      ...securityHeaders,
      ...(process.env.SITE_INDEXABLE === 'true' ? [] : [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }]),
    ] }]
  },
  async rewrites() {
    return [
      // Root-level sitemap URLs cover /toilet/* without relying on search-console scope overrides.
      { source: '/sitemap-toilets-:shard(\\d+).xml', destination: '/sitemaps/:shard.xml' },
      ...(process.env.NODE_ENV === 'development'
        ? [{ source: '/api/:path*', destination: 'https://api.geupddong.com/api/:path*' }] : []),
    ]
  },
}

export default config

import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()' },
]

const config: NextConfig = {
  deploymentId: process.env.NEXT_DEPLOYMENT_ID,
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_DEPLOYMENT_ID || 'development',
    // Build-time preview gate, never controlled by query strings or local storage.
    NEXT_PUBLIC_REVIEW_DESIGN_PREVIEW: process.env.SITE_INDEXABLE === 'false' && process.env.REVIEW_API_ENABLED !== 'true' ? 'true' : 'false',
    // Server integration candidate is preview-only; production activation needs a separate reviewed change.
    NEXT_PUBLIC_REVIEW_API_ENABLED: process.env.SITE_INDEXABLE === 'false' && process.env.REVIEW_API_ENABLED === 'true' ? 'true' : 'false',
  },
  distDir: process.env.NEXT_BUILD_DIR || '.next',
  poweredByHeader: false,
  reactStrictMode: true,
  // Fixed local preview origins only; never allow arbitrary development origins.
  allowedDevOrigins: ['127.0.0.1', '192.168.0.4'],
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
      ...(process.env.SITE_INDEXABLE === 'false' && process.env.REVIEW_API_ENABLED === 'true'
        && process.env.NEXT_PUBLIC_API_BASE_URL === 'https://preview.geupddong.com/__review-verification'
        ? [{ source: '/toilet/:id(\\d+)', destination: '/review-verification/:id' }] : []),
      // Root-level sitemap URLs cover /toilet/* without relying on search-console scope overrides.
      { source: '/sitemap-toilets-:shard(\\d+).xml', destination: '/sitemaps/:shard.xml' },
      ...(process.env.NODE_ENV === 'development'
        ? [{ source: '/api/:path*', destination: 'https://api.geupddong.com/api/:path*' }] : []),
    ]
  },
}

export default config

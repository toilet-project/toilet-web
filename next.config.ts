import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=()' },
]

const reviewPreviewApi = process.env.SITE_INDEXABLE === 'false'
  && process.env.REVIEW_API_ENABLED === 'true'
  && process.env.NEXT_PUBLIC_API_BASE_URL === 'https://preview.geupddong.com/__review-verification'
const reviewProductionApi = process.env.SITE_INDEXABLE === 'true'
  && process.env.REVIEW_API_ENABLED === 'true'
  && process.env.REVIEW_PRODUCTION_APPROVED === 'true'
  && process.env.NEXT_PUBLIC_API_BASE_URL === 'https://api.geupddong.com'
const reviewApiEnabled = reviewPreviewApi || reviewProductionApi
// Public review reads do not mutate production data. The fixed preview domain may
// use the production public API while authenticated review writes remain gated.
const publicReviewApiEnabled = reviewApiEnabled || process.env.SITE_INDEXABLE === 'false'
  && process.env.NEXT_PUBLIC_API_BASE_URL === 'https://api.geupddong.com'

const config: NextConfig = {
  deploymentId: process.env.NEXT_DEPLOYMENT_ID,
  env: {
    NEXT_PUBLIC_ENGLISH_UI_ENABLED: (process.env.SITE_INDEXABLE === 'false' && process.env.ENGLISH_UI_PREVIEW === 'true')
      || (process.env.SITE_INDEXABLE === 'true' && process.env.ENGLISH_UI_RELEASE === 'true') ? 'true' : 'false',
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_DEPLOYMENT_ID || 'development',
    // Both approved release targets use the matching map-cell Worker route.
    NEXT_PUBLIC_MAP_CELL_CACHE_ENABLED: ['false', 'true'].includes(process.env.SITE_INDEXABLE || '') ? 'true' : 'false',
    NEXT_PUBLIC_MAP_CLUSTER_CACHE_ENABLED: ['false', 'true'].includes(process.env.SITE_INDEXABLE || '') ? 'true' : 'false',
    // Build-time preview gate, never controlled by query strings or local storage.
    NEXT_PUBLIC_REVIEW_DESIGN_PREVIEW: process.env.SITE_INDEXABLE === 'false' && !reviewApiEnabled ? 'true' : 'false',
    // Production requires all four exact build-time gates above; runtime URLs cannot enable it.
    NEXT_PUBLIC_REVIEW_API_ENABLED: reviewApiEnabled ? 'true' : 'false',
    NEXT_PUBLIC_PUBLIC_REVIEW_API_ENABLED: publicReviewApiEnabled ? 'true' : 'false',
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
      ...(reviewPreviewApi
        ? [{ source: '/toilet/:id(\\d+)', destination: '/review-verification/:id' }] : []),
      // Root-level sitemap URLs cover /toilet/* without relying on search-console scope overrides.
      { source: '/sitemap-toilets-:shard(\\d+).xml', destination: '/sitemaps/:shard.xml' },
      ...(['en', 'ja', 'zh-cn', 'zh-tw', 'zh-hk'] as const).map(locale => ({
        // A dynamic locale parameter rejects hyphenated values before the route handler.
        source: `/sitemap-toilets-:shard(\\d+)-${locale}.xml`,
        destination: `/sitemaps/:shard-${locale}.xml`,
      })),
      ...(process.env.NODE_ENV === 'development'
        ? [{ source: '/api/:path*', destination: 'https://api.geupddong.com/api/:path*' }] : []),
    ]
  },
}

export default config

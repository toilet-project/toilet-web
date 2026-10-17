export const SITE_ORIGIN = 'https://geupddong.com'

export function robotsPolicy(indexable: boolean) {
  return indexable
    ? {
      rules: [
        { userAgent: ['ClaudeBot', 'Moltbot', 'GPTBot', 'Google-Extended', 'FacebookBot', 'Meta-ExternalAgent', 'Applebot-Extended'], disallow: '/' },
        { userAgent: '*', allow: '/', disallow: ['/api/', '/_internal/', '/admin/', '/login/'] },
      ],
      sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    }
    : { rules: { userAgent: '*', disallow: '/' } }
}

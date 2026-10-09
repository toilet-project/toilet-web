import { robotsPolicy } from './src/lib/robotsPolicy.ts'

const appleTrainingRule = { userAgent: 'Applebot-Extended', disallow: '/' }

function policy(host) {
  if (host === 'geupddong.com') return robotsPolicy(true)
  if (host === 'api.geupddong.com') return { rules: [appleTrainingRule, { userAgent: '*', allow: '/' }] }
  if (host === 'preview.geupddong.com') return { rules: [appleTrainingRule, { userAgent: '*', disallow: '/' }] }
  return null
}

function serialize(value) {
  const list = value => Array.isArray(value) ? value : value === undefined ? [] : [value]
  const rules = list(value.rules).map(rule => [
    ...list(rule.userAgent).map(agent => `User-agent: ${agent}`),
    ...list(rule.allow).map(path => `Allow: ${path}`),
    ...list(rule.disallow).map(path => `Disallow: ${path}`),
  ].join('\n'))
  return [...rules, ...list(value.sitemap).map(url => `Sitemap: ${url}`)].join('\n\n') + '\n'
}

export default {
  fetch(request) {
    const url = new URL(request.url)
    const selected = policy(url.hostname)
    if (url.pathname !== '/robots.txt' || !selected) return new Response('Not found', { status: 404 })
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
    const headers = {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    }
    if (url.hostname === 'preview.geupddong.com') headers['X-Robots-Tag'] = 'noindex, nofollow'
    return new Response(request.method === 'HEAD' ? null : serialize(selected), { headers })
  },
}

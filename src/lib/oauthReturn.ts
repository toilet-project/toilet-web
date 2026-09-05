// Only the approved preview origin requests preview return. Never send an arbitrary URL.
export function socialLoginPath(provider: 'google' | 'kakao', origin: string) {
  const query = origin === 'https://preview.geupddong.com' ? '?returnTo=preview' : ''
  return `/api/v1/auth/login/${provider}${query}`
}

const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

if (!configuredApiBaseUrl && process.env.NODE_ENV === 'production') {
  throw new Error('NEXT_PUBLIC_API_BASE_URL 환경변수가 설정되지 않았습니다.')
}

// 개발 환경만 Next rewrite를 사용한다. 운영 브라우저 요청은 기존 API로 직접 보낸다.
export const apiBaseUrl = configuredApiBaseUrl?.replace(/\/$/, '') ?? ''

export function createApiUrl(path: string) {
  return `${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`
}

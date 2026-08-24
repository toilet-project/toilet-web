const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL

if (!configuredApiBaseUrl && !import.meta.env.DEV) {
  throw new Error('VITE_API_BASE_URL 환경변수가 설정되지 않았습니다.')
}

// 개발 서버에서는 Vite 프록시를 사용해 CORS 설정 없이 운영 API를 확인한다.
export const apiBaseUrl = configuredApiBaseUrl?.replace(/\/$/, '') ?? ''

export function createApiUrl(path: string) {
  return `${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`
}

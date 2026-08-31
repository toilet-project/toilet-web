import { createApiUrl } from '../config/api'

export type AuthProfile = {
  userId: string
  roles: string[]
}

async function fetchProfile() {
  return fetch(createApiUrl('/api/v1/auth/me'), { credentials: 'include' })
}

export async function getCurrentUser(): Promise<AuthProfile | null> {
  let response = await fetchProfile()

  if (response.status === 401) {
    const refreshed = await fetch(createApiUrl('/api/v1/auth/refresh'), {
      method: 'POST', credentials: 'include',
    })
    if (refreshed.ok) response = await fetchProfile()
  }

  if (response.status === 401) return null
  if (!response.ok) throw new Error('로그인 상태를 확인하지 못했습니다.')
  return response.json() as Promise<AuthProfile>
}

export function startSocialLogin(provider: 'google' | 'kakao') {
  window.location.assign(createApiUrl(`/api/v1/auth/login/${provider}`))
}

export async function logout() {
  const response = await fetch(createApiUrl('/api/v1/auth/logout'), {
    method: 'POST', credentials: 'include',
  })
  if (!response.ok) throw new Error('로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.')
}

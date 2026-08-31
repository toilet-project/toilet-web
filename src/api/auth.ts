import { createApiUrl } from '../config/api'

export type AuthProfile = {
  userId: string
  displayName: string | null
  email: string | null
  status: 'PENDING_CONSENT' | 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN'
  roles: string[]
  consentRequired: boolean
}

export type PolicyKey = 'SERVICE_TERMS' | 'PRIVACY_COLLECTION' | 'AGE_14_PLUS' | 'PRIVACY_POLICY' | 'LOCATION_NOTICE'

export type PolicyDocument = {
  id: number
  key: PolicyKey
  version: string
  title: string
  required: boolean
  effectiveAt: string
  contentPath: string
}

export type PolicyAgreement = {
  key: PolicyKey
  version: string
  title: string
  contentPath: string
  agreedAt: string
}

export type PolicyConsentStatus = {
  consentRequired: boolean
  missingPolicies: PolicyDocument[]
  agreedPolicies: PolicyAgreement[]
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

export async function fetchPolicies(): Promise<PolicyDocument[]> {
  const response = await fetch(createApiUrl('/api/v1/policies'))
  if (!response.ok) throw new Error('약관 정보를 불러오지 못했습니다.')
  return response.json() as Promise<PolicyDocument[]>
}

export async function agreeToRequiredPolicies(policyKeys: PolicyKey[]) {
  const response = await fetch(createApiUrl('/api/v1/auth/consents'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ policyKeys }),
  })
  if (!response.ok) throw new Error('약관 동의를 저장하지 못했습니다.')
}

export async function fetchPolicyConsentStatus(): Promise<PolicyConsentStatus> {
  const response = await fetch(createApiUrl('/api/v1/auth/consents/status'), { credentials: 'include' })
  if (!response.ok) throw new Error('약관 동의 내역을 불러오지 못했습니다.')
  return response.json() as Promise<PolicyConsentStatus>
}

export async function withdrawAccount() {
  const response = await fetch(createApiUrl('/api/v1/auth/me'), {
    method: 'DELETE', credentials: 'include',
  })
  if (!response.ok) throw new Error('회원 탈퇴를 처리하지 못했습니다.')
}

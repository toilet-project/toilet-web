import { createApiUrl } from '../config/api'
import { socialLoginPath } from '../lib/oauthReturn'

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
  window.location.assign(createApiUrl(socialLoginPath(provider, window.location.origin)))
}

export async function logout() {
  const response = await fetch(createApiUrl('/api/v1/auth/logout'), {
    method: 'POST', credentials: 'include',
  })
  if (!response.ok) throw new Error('로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.')
}

export class AuthExpiredError extends Error {}

export async function updateNickname(displayName: string): Promise<{ displayName: string }> {
  const response = await fetch(createApiUrl('/api/v1/auth/me/profile'), {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: displayName.trim() }),
  })
  if (response.status === 401) throw new AuthExpiredError('로그인이 만료되었어요. 다시 로그인해 주세요.')
  if (response.status === 400) throw new Error('닉네임은 공백만 제외한 2~30자로 입력해 주세요. 제어 문자는 사용할 수 없어요.')
  if (!response.ok) throw new Error('닉네임을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.')
  return response.json() as Promise<{ displayName: string }>
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

export type WithdrawalOptions = { enabled: boolean; consentVersion: string; purgeAfter: string }
export async function fetchWithdrawalOptions(): Promise<WithdrawalOptions> {
  const response = await fetch(createApiUrl('/api/v1/auth/withdrawal-options'), { credentials: 'include', cache: 'no-store' })
  if (!response.ok) throw new Error('탈퇴 안내를 불러오지 못했습니다. 다시 시도해 주세요.')
  return response.json() as Promise<WithdrawalOptions>
}

export async function withdrawAccount(retainForRecovery: boolean, consentVersion?: string) {
  const response = await fetch(createApiUrl('/api/v1/auth/me'), {
    method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ retainForRecovery, consentVersion }),
  })
  if (!response.ok) throw new Error('회원 탈퇴를 처리하지 못했습니다.')
  const receipt = response.status === 200 ? await response.json() as { purgeAfter?: string } : null
  return { erasurePending: response.status === 202, purgeAfter: receipt?.purgeAfter }
}

export type RecoveryStatus = { purgeAfter: string; displayName: string | null }
export async function fetchRecoveryStatus(): Promise<RecoveryStatus> {
  const response = await fetch(createApiUrl('/api/v1/auth/recovery'), { credentials: 'include', cache: 'no-store' })
  if (!response.ok) throw new Error('복구 확인 시간이 지났거나 보관 기간이 끝났어요. 다시 소셜 로그인해 주세요.')
  return response.json() as Promise<RecoveryStatus>
}
export async function decideRecovery(action: 'RESTORE' | 'ERASE') {
  const response = await fetch(createApiUrl('/api/v1/auth/recovery'), {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
  })
  if (!response.ok) throw new Error('요청을 완료하지 못했어요. 다시 소셜 로그인한 뒤 계정 상태를 확인해 주세요.')
  return { erasurePending: response.status === 202 }
}
export async function cancelRecovery() {
  const response = await fetch(createApiUrl('/api/v1/auth/recovery'), { method: 'DELETE', credentials: 'include' })
  if (!response.ok) throw new Error('확인을 종료하지 못했어요. 다시 시도해 주세요.')
}

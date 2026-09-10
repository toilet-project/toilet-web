const pending = { erasurePending: true, purgeAfter: undefined }

export function lifecycleErrorMessage(status: number, fallback: string): string {
  if (status === 503) return '탈퇴·복구 기능 점검 중입니다. 개인정보 문의로 요청해 주세요.'
  if (status === 401) return '인증 시간이 만료됐어요. 다시 소셜 로그인한 뒤 계정 상태를 확인해 주세요.'
  return fallback
}

export function withdrawalReceipt(status: number, retain: boolean, body?: unknown) {
  if (status === 202) return pending
  if (status === 204 && !retain) return { erasurePending: false, purgeAfter: undefined }
  if (status === 200 && retain && body && typeof body === 'object' && 'purgeAfter' in body
      && typeof body.purgeAfter === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(body.purgeAfter)
      && Number.isFinite(Date.parse(body.purgeAfter))) {
    return { erasurePending: false, purgeAfter: body.purgeAfter }
  }
  throw new Error(lifecycleErrorMessage(status, '탈퇴 처리 결과를 확인하지 못했어요. 다시 로그인하거나 개인정보 문의로 확인해 주세요.'))
}

export function recoveryReceipt(status: number, action: 'RESTORE' | 'ERASE') {
  if (status === 204) return { erasurePending: false }
  if (status === 202 && action === 'ERASE') return { erasurePending: true }
  throw new Error(lifecycleErrorMessage(status, '요청 결과를 확인하지 못했어요. 다시 소셜 로그인한 뒤 계정 상태를 확인해 주세요.'))
}

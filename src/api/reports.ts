import { createApiUrl } from '../config/api'

export type CreateToiletReportRequest = {
  toiletId: number
  reportType: 'COORDINATE_CORRECTION' | 'OPEN_TIME_CORRECTION'
  latitude?: number
  longitude?: number
  roadAddress?: string
  openTime?: string
  reason: string
}

export async function createToiletReport(request: CreateToiletReportRequest) {
  const response = await fetch(createApiUrl('/api/v1/reports'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (response.status === 401) throw new Error('제보하려면 먼저 로그인해 주세요.')
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(payload?.message || '제보를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.')
  }
}

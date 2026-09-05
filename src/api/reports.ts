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

export type ToiletReportStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export type ToiletReport = {
  id: number
  toiletId: number
  toiletName: string
  reportType: 'COORDINATE_CORRECTION' | 'OPEN_TIME_CORRECTION'
  latitude?: number | null
  longitude?: number | null
  roadAddress?: string | null
  jibunAddress?: string | null
  openTime?: string | null
  reason: string
  status: ToiletReportStatus
  reviewNote?: string | null
  createdAt: string
  reviewedAt?: string | null
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

export async function fetchMyToiletReports(): Promise<ToiletReport[]> {
  const response = await fetch(createApiUrl('/api/v1/reports/me'), { credentials: 'include' })
  if (response.status === 401) throw new Error('로그인이 필요합니다.')
  if (!response.ok) throw new Error('내 제보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
  return response.json() as Promise<ToiletReport[]>
}

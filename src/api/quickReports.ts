export const QUICK_REPORTS_ENABLED = process.env.NEXT_PUBLIC_REPORT_REDESIGN_PREVIEW === 'true'
export type QuickReportType = 'FACILITY_MISSING' | 'COORDINATE_CORRECTION' | 'TEMPORARILY_CLOSED' | 'NEW_FACILITY'
export type QuickReportRequest = {
  toiletId?: number; reportType: QuickReportType; latitude?: number; longitude?: number
  roadAddress?: string; name?: string; reason?: string
}

let memoryGuest: string | undefined
function guestId() {
  try {
    const existing = sessionStorage.getItem('geupddong.report.guest')
    if (existing && /^[a-f0-9-]{36}$/i.test(existing)) return existing
    const id = crypto.randomUUID()
    sessionStorage.setItem('geupddong.report.guest', id)
    return id
  } catch { return memoryGuest ??= crypto.randomUUID() }
}

/** Preview writes NEVER fall back to the production API. */
export async function submitQuickReport(request: QuickReportRequest, requestId: string) {
  if (!QUICK_REPORTS_ENABLED || window.location.hostname !== 'preview.geupddong.com') throw new Error('PREVIEW_UNAVAILABLE')
  const response = await fetch('/__report-preview/api/v1/reports/guest', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId, 'X-Report-Guest': guestId() },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    const error = new Error(data?.error?.message || data?.message || 'REPORT_FAILED')
    Object.assign(error, { status: response.status })
    throw error
  }
  const receipt = await response.json() as { id: number; status: string }
  if (!Number.isSafeInteger(receipt.id) || !['PENDING', 'APPROVED', 'REJECTED'].includes(receipt.status)) throw new Error('INVALID_RECEIPT')
  return receipt
}

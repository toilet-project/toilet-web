import { apiBaseUrl } from '../config/api'
import { reportDestination, sendQuickReport, type ReportIdentity } from '../lib/quickReportTransport'
export const QUICK_REPORTS_PREVIEW = process.env.NEXT_PUBLIC_REPORT_REDESIGN_PREVIEW === 'true'
const release = process.env.NEXT_PUBLIC_REPORT_REDESIGN_RELEASE === 'true'
export const QUICK_REPORTS_ENABLED = QUICK_REPORTS_PREVIEW || release
export type QuickReportType = 'FACILITY_MISSING' | 'COORDINATE_CORRECTION' | 'TEMPORARILY_CLOSED' | 'NEW_FACILITY'
export type NewFacilityInfo = {
  toiletType?: string | null; openTime?: string | null; openTimeDetail?: string | null
  agencyName?: string | null; phoneNumber?: string | null
  emergencyBell?: boolean | null; cctv?: boolean | null; diaperTable?: boolean | null
  maleDisabledToiletCount?: number | null; femaleDisabledToiletCount?: number | null
}
export type QuickReportRequest = {
  toiletId?: number; reportType: QuickReportType; latitude?: number; longitude?: number
  roadAddress?: string; name?: string; reason?: string; facilityInfo?: NewFacilityInfo
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
export async function submitQuickReport(request: QuickReportRequest, requestId: string, identity: ReportIdentity) {
  const destination = reportDestination(window.location.hostname, QUICK_REPORTS_PREVIEW, release, apiBaseUrl, identity)
  return sendQuickReport(destination, request, requestId, guestId)
}

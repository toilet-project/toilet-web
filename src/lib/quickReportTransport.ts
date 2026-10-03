export type ReportIdentity = 'member' | 'guest' | 'loading'
export function reportDestination(hostname: string, preview: boolean, release: boolean, apiBase: string, identity: ReportIdentity) {
  if (preview && hostname === 'preview.geupddong.com') {
    return { url: '/__report-preview/api/v1/reports/guest', credentials: 'same-origin' as const, guest: true }
  }
  if (release && !preview && ['geupddong.com', 'www.geupddong.com'].includes(hostname)
      && apiBase === 'https://api.geupddong.com' && identity !== 'loading') {
    const guest = identity === 'guest'
    return { url: `${apiBase}/api/v1/reports/${guest ? 'guest' : 'quick'}`, credentials: guest ? 'omit' as const : 'include' as const, guest }
  }
  throw new Error('REPORT_UNAVAILABLE')
}

export async function sendQuickReport(destination: ReturnType<typeof reportDestination>, body: unknown, requestId: string, guestId: () => string, request: typeof fetch = fetch) {
  const response = await request(destination.url, {
    method: 'POST', credentials: destination.credentials, cache: 'no-store', redirect: 'error',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId, ...(destination.guest ? { 'X-Report-Guest': guestId() } : {}) },
    body: JSON.stringify(body),
  })
  // Do not retry an expired member session as an anonymous submission.
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

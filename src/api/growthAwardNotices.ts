import { createApiUrl } from '../config/api'
import { fetchSessionRead } from './session'
import { decodeAwardNotices } from '../lib/growthAwardNotices'

export async function fetchAwardNotices() {
  const response = await fetchSessionRead(createApiUrl('/api/v1/growth/award-notices'))
  if (!response.ok) throw new Error('AWARD_NOTICES_UNAVAILABLE')
  return decodeAwardNotices(await response.json())
}
export async function acknowledgeAwardNotices(ids: string[]) {
  const response = await fetch(createApiUrl('/api/v1/growth/award-notices/acknowledge'), {
    method: 'POST', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
  })
  if (!response.ok) throw new Error('AWARD_NOTICE_ACKNOWLEDGEMENT_FAILED')
}

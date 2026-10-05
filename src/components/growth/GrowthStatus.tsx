'use client'
import { useLocale } from '../../i18n/context'
import { growthText } from '../../i18n/growthText'
import type { GrowthState } from '../../lib/growthStore'
export function GrowthStatus({ state, retry }: { state: GrowthState; retry: () => void }) {
  const t = growthText(useLocale())
  if (state.status === 'ready' && !state.checkInError) return null
  const message = state.checkInError ? t.checkInError : state.status === 'disabled' ? t.preparing : state.status === 'error' ? t.error : state.status === 'signedOut' ? t.expired : t.loading
  return <p className="growth-state" role="status">{message}{(state.status === 'error' || state.checkInError) && <button type="button" onClick={retry}>{t.retry}</button>}</p>
}

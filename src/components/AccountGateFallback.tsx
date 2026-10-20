'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cancelRecovery } from '../api/auth'
import { useLocale, useMessages } from '../i18n/context'
import { localizedPublicPath } from '../i18n/routes'
import { createRecoveryExit } from '../lib/recoveryExit'
import { useDialogFocus } from '../lib/useDialogFocus'

function GateFallback({ title, actionLabel, onAction, onRetry, busy = false, error }: {
  title: string; actionLabel: string; onAction: () => void; onRetry?: () => void; busy?: boolean; error?: string;
}) {
  const t = useMessages()
  // These are explicit account decisions: Escape/backdrop must never log out
  // or cancel recovery under the misleading label of closing a dialog.
  const dialog = useDialogFocus(true, () => {})
  return <div className="account-backdrop"><section ref={dialog} className="account-dialog lazy-panel-state"
    role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
    <h1>{title}</h1>
    <p role={onRetry ? 'alert' : 'status'}>{t(onRetry ? 'error.load' : 'common.loading')}</p>
    {onRetry && <><p>{t('error.retryHint')}</p><button type="button" onClick={onRetry} disabled={busy}>{t('error.retry')}</button></>}
    {error && <p className="consent-error" role="alert">{error}</p>}
    <button type="button" onClick={onAction} disabled={busy} aria-busy={busy || undefined}>{actionLabel}</button>
  </section></div>
}

export function PolicyConsentFallback({ isNewRegistration, onLogout, onRetry }: {
  isNewRegistration: boolean; onLogout: () => void; onRetry?: () => void;
}) {
  const t = useMessages()
  return <GateFallback title={t(isNewRegistration ? 'consent.signupTitle' : 'consent.updateTitle')}
    actionLabel={t('consent.logout')} onAction={onLogout} onRetry={onRetry} />
}

export function AccountRecoveryFallback({ onRetry }: { onRetry?: () => void }) {
  const locale = useLocale(), t = useMessages()
  const home = localizedPublicPath('/', locale)!
  const exit = useMemo(() => createRecoveryExit({ cancel: cancelRecovery,
    replace: path => window.location.replace(path), home }), [home])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const current = useRef(true)
  const request = useRef<Promise<void> | null>(null)
  useEffect(() => {
    current.current = true
    return () => { current.current = false }
  }, [])
  const leave = () => {
    if (request.current) return
    setBusy(true)
    setError('')
    const pending = exit()
    request.current = pending
    void pending.catch(reason => {
      if (current.current) {
        setError(locale === 'ko' && reason instanceof Error ? reason.message : t('recovery.closeError'))
        setBusy(false)
      }
      request.current = null
    })
  }
  return <GateFallback title={t('recovery.title')} actionLabel={t(busy ? 'common.processing' : 'recovery.notNow')}
    onAction={leave} onRetry={onRetry} busy={busy} error={error} />
}

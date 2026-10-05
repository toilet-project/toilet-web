'use client'
import { Component, Suspense, type ReactNode } from 'react'
import { useMessages } from '../i18n/context'
import { useDialogFocus } from '../lib/useDialogFocus'

class PanelBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function PanelFallback({ modal, onClose, onRetry }: { modal: boolean; onClose?: () => void; onRetry?: () => void }) {
  const t = useMessages()
  const dialog = useDialogFocus(modal, onClose ?? (() => {}))
  const content = <section ref={dialog} className={modal ? 'account-dialog lazy-panel-state' : 'mobile-page lazy-panel-state'}
    role={modal ? 'dialog' : undefined} aria-modal={modal ? true : undefined} aria-label={t(onRetry ? 'error.load' : 'common.loading')} tabIndex={-1}>
    {modal && onClose && <button type="button" className="login-modal-close" onClick={onClose} aria-label={t('common.close')}>×</button>}
    <p role={onRetry ? 'alert' : 'status'}>{t(onRetry ? 'error.load' : 'common.loading')}</p>
    {onRetry && <><p>{t('error.retryHint')}</p><button type="button" onClick={onRetry}>{t('error.retry')}</button></>}
  </section>
  return modal ? <div className="account-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose?.() }}>{content}</div> : content
}

export function LazyPanelFrame({ children, attempt, modal, onClose, onRetry }: {
  children?: ReactNode; attempt: number; modal: boolean; onClose?: () => void; onRetry: () => void;
}) {
  return <PanelBoundary key={attempt} fallback={<PanelFallback modal={modal} onClose={onClose} onRetry={onRetry} />}>
    <Suspense fallback={<PanelFallback modal={modal} onClose={onClose} />}>{children}</Suspense>
  </PanelBoundary>
}

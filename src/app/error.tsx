'use client'
import { useMessages } from '../i18n/context'

export default function ErrorPage({ reset }: { reset: () => void }) {
  const t = useMessages()
  return <main className="app-error"><strong>{t('error.load')}</strong><p>{t('error.retryHint')}</p><button type="button" onClick={reset}>{t('error.retry')}</button></main>
}

import { useMessages } from '../../i18n/context'

export function ReviewPanelFallback({ onRetry }: { onRetry?: () => void }) {
  const t = useMessages()
  return <p role={onRetry ? 'alert' : 'status'}>{t(onRetry ? 'error.load' : 'common.loading')}{onRetry && <> <button type="button" onClick={onRetry}>{t('common.retry')}</button></>}</p>
}

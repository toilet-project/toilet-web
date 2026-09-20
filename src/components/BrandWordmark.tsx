import type { Locale } from '../i18n/locale'

/** Keeps the English wordmark as prominent as the Korean brand without widening the mobile header. */
export function BrandWordmark({ locale }: { locale: Locale }) {
  if (locale === 'ko') return <span className="brand-wordmark is-korean" aria-hidden="true">급똥</span>
  return <span className="brand-wordmark is-english" aria-hidden="true"><span>GEUP</span><span>DDONG</span></span>
}

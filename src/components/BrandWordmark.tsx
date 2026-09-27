import type { Locale } from '../i18n/locale'
import { BRAND_ASSET_BASE } from '../lib/brand'

/** Compact headers keep their established text; large auth surfaces opt into the symbol. */
export function BrandWordmark({ locale, withSymbol = false }: { locale: Locale; withSymbol?: boolean }) {
  if (withSymbol && locale === 'ko') return <span className="brand-lockup is-korean" aria-hidden="true"><img className="brand-image" src={`${BRAND_ASSET_BASE}/lockup-ko.svg`} width="646" height="232" alt="" /></span>
  const wordmark = locale === 'ko'
    ? <span className="brand-wordmark is-korean" aria-hidden="true">급똥</span>
    : <span className="brand-wordmark is-english" aria-hidden="true"><span>GEUP</span><span>DDONG</span></span>
  if (!withSymbol) return wordmark
  return <span className="brand-lockup is-international" aria-hidden="true"><img className="brand-symbol" src={`${BRAND_ASSET_BASE}/symbol-green.svg`} width="256" height="224" alt="" />{wordmark}</span>
}

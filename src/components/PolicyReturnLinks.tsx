'use client'

import { useSyncExternalStore } from 'react'
import { readLocalePreference, type Locale } from '../i18n/locale'
import { localizedPublicPath } from '../i18n/routes'
import { policyReturnLocale } from '../i18n/policyReturn'

/** The canonical Korean policy stays static; only its map-return links use visitor context. */
function getMapPath() {
  let preferred: Locale | null = null
  try { preferred = readLocalePreference(window.localStorage) } catch { /* Private browsing can deny storage. */ }
  const locale = policyReturnLocale(preferred, document.referrer, window.location.origin)
  return localizedPublicPath('/', locale) ?? '/'
}

const subscribe = () => () => {}
const serverMapPath = () => '/'

export function PolicyReturnLinks() {
  const mapPath = useSyncExternalStore(subscribe, getMapPath, serverMapPath)
  return <>
    <a href={mapPath} className="policy-brand">급똥</a>
    <a href={mapPath} className="policy-home-link">지도로 돌아가기</a>
  </>
}

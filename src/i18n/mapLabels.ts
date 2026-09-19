import type { Locale } from './locale.ts'
import { message } from './messages.ts'

// Only called for app-generated notices, never facility fields or user text.
const notices: Record<string, string> = {
  "로그인 상태를 확인하고 있어요. 잠시 후 다시 눌러 주세요.": "Checking your login. Please try again shortly.",
  "필수 약관 동의를 먼저 완료해 주세요.": "Please accept the required terms first.",
  "로그인 계정이 변경됐어요. 리뷰를 다시 눌러 주세요.": "Your account has changed. Please select Review again.",
  "로그인이 취소되었거나 완료되지 않았습니다. 다시 시도해 주세요.": "Login was cancelled or not completed. Please try again.",
  "제보를 시작하려면 필수 약관에 먼저 동의해 주세요.": "Accept the required terms before submitting a report.",
  "내 제보를 확인하려면 필수 약관에 먼저 동의해 주세요.": "Accept the required terms to view your reports.",
  "로그인이 만료되었어요. 다시 로그인해 주세요.": "Your session expired. Please log in again.",
  "로그아웃하지 못했습니다.": "Could not log out. Please try again.",
  "약관 동의가 완료되었습니다.": "Your consent has been saved.",
  "검색 결과가 없습니다.": "No places found.",
  "장소를 검색하지 못했습니다. 잠시 후 다시 시도해 주세요.": "Could not search places. Please try again.",
  "화장실 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.": "Could not load toilets. Please try again.",
  "지도를 불러오지 못했습니다.": "Could not load the map. Please try again.",
  "이 브라우저에서는 현재 위치를 지원하지 않습니다.": "This browser does not support location access.",
  "위치 권한이 거부되었습니다. 브라우저의 사이트 설정에서 위치를 허용해 주세요.": "Allow location access in your browser’s site settings.",
  "위치 권한이 거부되었습니다. 브라우저 주소창의 위치 권한을 허용한 뒤 다시 시도해 주세요.": "Allow location access in your browser’s site settings, then try again.",
  "현재 위치를 확인할 수 없습니다. GPS·Wi‑Fi 연결을 확인해 주세요.": "Location unavailable. Check your GPS or Wi-Fi connection.",
  "위치 확인 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.": "Location request timed out. Please try again.",
  "현재 위치를 확인하지 못했습니다.": "Could not determine your location."
}
export function mapSystemNotice(value: string | null, locale: Locale): string {
  if (!value) return ''
  if (locale === 'ko') return value
  return Object.hasOwn(notices, value) ? notices[value] : 'Could not complete the request. Please try again.'
}

// Change overlay labels in place, without recreating the map, moving its camera or fetching data.
export function localizeMapLabels(root: HTMLElement | null, locale: Locale) {
  root?.querySelectorAll<HTMLElement>('[data-map-label]').forEach(node => {
    const count = Number(node.dataset.mapCount) || 0
    if (node.dataset.mapLabel === 'reference') {
      node.setAttribute('aria-label', locale === 'en' ? 'Distance reference point' : '거리 기준점')
      const label = node.querySelector('.map-reference-marker-label')
      if (label) label.textContent = locale === 'en' ? 'Reference' : '기준점'
    } else if (node.dataset.mapLabel === 'current') {
      const label = node.querySelector('.sr-only')
      if (label) label.textContent = message(locale, 'map.currentLocation')
    } else if (node.dataset.mapLabel === 'group') {
      const name = node.dataset.mapName || message(locale, 'map.sameLocation')
      node.setAttribute('aria-label', message(locale, 'map.groupMarker', { name, count }))
      if (!node.dataset.mapName) node.textContent = message(locale, 'map.sameLocation') + ' ' + count
    } else if (node.dataset.mapLabel === 'cluster') {
      node.setAttribute('aria-label', message(locale, 'map.clusterMarker', { count }))
    }
  })
}

// The web page cannot distinguish an OS-level block from a site-level denial.
// Offer the relevant recovery path without claiming the user rejected a prompt.
export function locationPermissionMessage(browser: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>): string {
  const ios = /iPhone|iPad|iPod/.test(browser.userAgent)
    || browser.platform === 'MacIntel' && browser.maxTouchPoints > 1
  if (ios && /CriOS\//.test(browser.userAgent)) {
    return 'Chrome에서 위치에 접근할 수 없습니다. iPhone·iPad 설정 → 개인정보 보호 및 보안 → 위치 서비스 → Chrome에서 위치 접근을 허용한 뒤 다시 눌러 주세요.'
  }
  if (ios) {
    return '위치에 접근할 수 없습니다. iPhone·iPad 설정 → 개인정보 보호 및 보안 → 위치 서비스에서 사용 중인 브라우저의 위치 접근을 확인해 주세요.'
  }
  return '위치에 접근할 수 없습니다. 브라우저의 사이트 설정과 기기의 위치 권한을 확인한 뒤 다시 눌러 주세요.'
}

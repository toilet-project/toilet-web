export const MOBILE_REVIEW_ONLY_MESSAGE = '리뷰는 모바일에서 작성할 수 있어요.'

type ReviewNavigator = Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> & {
  userAgentData?: { mobile?: boolean }
}

/** New reviews require a mobile device; resizing a desktop window is not sufficient. */
export function isMobileReviewDevice(value?: ReviewNavigator): boolean {
  const device = value ?? (typeof navigator === 'undefined' ? undefined : navigator as ReviewNavigator)
  if (!device) return false
  if (device.userAgentData?.mobile === true) return true
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(device.userAgent)) return true
  // Modern iPadOS may identify itself as macOS.
  return device.platform === 'MacIntel' && device.maxTouchPoints > 1
}

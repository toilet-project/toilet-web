import type { Locale } from './locale.ts'
import { message } from './messages.ts'
import { ReviewApiError } from '../lib/reviewApi.ts'
import { ReviewGateError } from '../lib/reviewLocation.ts'

const apiErrors: Record<string, string> = {
  REVIEWS_DISABLED: 'Review posting is not available yet.',
  AUTHENTICATION_REQUIRED: 'Your session expired. Please log in again.',
  REVIEW_ACCOUNT_UNAVAILABLE: 'Reviews are not available for this account.',
  POLICY_CONSENT_REQUIRED: 'Please accept the required terms first.',
  REVIEW_ALREADY_EXISTS: 'You can review each restroom once every 24 hours. Check your existing review.',
  REVIEW_CHANGED: 'This review changed in another window. Reopen the list to see the latest version.',
  REVIEW_EDIT_EXPIRED: 'The 7-day window for editing or removing author details has ended.',
  REVIEW_NOT_FOUND: 'Review not found. Please check the list again.',
  REVIEW_COOLDOWN: 'Please wait a moment before posting again.',
  REVIEW_DAILY_LIMIT: 'You have reached today’s review limit.',
  REVIEW_REQUEST_REUSED: 'The request changed. Check whether your review was already saved.',
  REVIEW_UNLINK_UNAVAILABLE: 'Could not safely remove your author details. Please try again shortly.',
  REVIEW_INVALID_REQUEST: 'Check your review and location information.',
  INVALID_RESPONSE: 'Could not verify the review response. Please reload.',
  INVALID_TARGET: 'Real reviews cannot be saved for test restrooms.',
  NETWORK: 'Connection problem. Check whether your review was saved before trying again.',
  BUSY: 'Still processing. Please wait a moment.',
}

// Only known client-generated errors are translated; never use this on review text.
const locationErrors: Record<string, string> = {
  '이 화장실의 위치를 확인할 수 없어 리뷰를 작성할 수 없어요.': 'This restroom’s location is unavailable, so reviews cannot be posted.',
  '이 브라우저에서는 현재 위치를 확인할 수 없어요.': 'This browser cannot access your location.',
  '최근 5분 이내 위치를 확인하지 못했어요. 다시 시도해 주세요.': 'A location reading from the last 5 minutes is needed. Please try again.',
  '위치 확인이 오래 걸리고 있어요. 위치 권한을 확인하고 다시 시도해 주세요.': 'Location is taking longer than expected. Check location permissions and try again.',
  '리뷰를 쓰려면 현재 위치 권한을 허용해 주세요.': 'Allow location access to write a review.',
  '현재 위치를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.': 'Could not check your location. Please try again shortly.',
  '리뷰는 화장실 150m 이내에서 가능해요.': 'You must be within 150 m to write a review.',
  '리뷰 저장 상태를 확인해 주세요.': 'Please check whether your review was saved.',
  '리뷰를 저장하고 있어요. 잠시 기다려 주세요.': 'Saving your review. Please wait a moment.',
  '로그인과 위치 확인을 먼저 완료해 주세요.': 'Please finish checking your login and location first.',
  '작성 후 24시간이 지나야 다시 리뷰를 남길 수 있어요.': 'You can review each restroom once every 24 hours.',
  '로그인이 변경됐어요. 다시 확인해 주세요.': 'Your login changed. Please check it again.',
  '위치 확인 후 시간이 지났어요. 다시 확인해 주세요.': 'Your location reading has expired. Please check it again.',
  '위치 확인 후 시간이 지났어요. 다시 저장해 주세요.': 'Your location reading has expired. Please try saving again.',
  '작성 후 7일이 지나 수정할 수 없어요.': 'The 7-day editing window has ended.',
}

export function reviewErrorMessage(error: unknown, locale: Locale): string {
  if (!(error instanceof ReviewApiError || error instanceof ReviewGateError)) return message(locale, 'review.loadFailed')
  if (locale === 'ko') return error.message
  if (error instanceof ReviewApiError) return Object.hasOwn(apiErrors, error.code) ? apiErrors[error.code] : 'Could not complete the review request. Please try again.'
  if (error.code === 'session') return 'Please check your login and try again.'
  if (error.code === 'distance') return message(locale, 'review.nearbyRequired')
  return Object.hasOwn(locationErrors, error.message) ? locationErrors[error.message] : 'Could not verify your location. Please try again.'
}

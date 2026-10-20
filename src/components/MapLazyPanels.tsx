import { createElement, type ComponentProps } from 'react'
import { createLazyPanel } from '../lib/createLazyPanel'
import { PublicReviewsFallback } from './reviews/PublicReviewsLoading'
import { AccountRecoveryFallback, PolicyConsentFallback } from './AccountGateFallback'

export const MobilePage = createLazyPanel<ComponentProps<typeof import('./MobilePage').MobilePage>>(() => import('./MobilePage').then(module => ({ default: module.MobilePage })), false)
export const ToiletReportModal = createLazyPanel<ComponentProps<typeof import('./ToiletReportModal').ToiletReportModal>>(() => import('./ToiletReportModal').then(module => ({ default: module.ToiletReportModal })))
export const QuickReportModal = createLazyPanel<ComponentProps<typeof import('./QuickReportModal').QuickReportModal>>(() => import('./QuickReportModal').then(module => ({ default: module.QuickReportModal })))
export const MyReportsPanel = createLazyPanel<ComponentProps<typeof import('./MyReportsPanel').MyReportsPanel>>(() => import('./MyReportsPanel').then(module => ({ default: module.MyReportsPanel })))
export const AccountDialog = createLazyPanel<ComponentProps<typeof import('./AccountDialog').AccountDialog>>(() => import('./AccountDialog').then(module => ({ default: module.AccountDialog })))
export const PublicReviews = createLazyPanel<ComponentProps<typeof import('./reviews/PublicReviews').PublicReviews>>(() => import('./reviews/PublicReviews').then(module => ({ default: module.PublicReviews })), false, onRetry => createElement(PublicReviewsFallback, { onRetry }))
export const PolicyConsentModal = createLazyPanel<ComponentProps<typeof import('./PolicyConsentModal').PolicyConsentModal>>(() => import('./PolicyConsentModal').then(module => ({ default: module.PolicyConsentModal })), true,
  (onRetry, props) => createElement(PolicyConsentFallback, { isNewRegistration: props.isNewRegistration, onLogout: props.onLogout, onRetry }))
export const AccountRecoveryDialog = createLazyPanel<Record<string, never>>(() => import('./AccountRecoveryDialog').then(module => ({ default: module.AccountRecoveryDialog })), true,
  onRetry => createElement(AccountRecoveryFallback, { onRetry }))

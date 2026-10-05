import type { ComponentProps } from 'react'
import { createLazyPanel } from '../lib/createLazyPanel'

export const MobilePage = createLazyPanel<ComponentProps<typeof import('./MobilePage').MobilePage>>(() => import('./MobilePage').then(module => ({ default: module.MobilePage })), false)
export const ToiletReportModal = createLazyPanel<ComponentProps<typeof import('./ToiletReportModal').ToiletReportModal>>(() => import('./ToiletReportModal').then(module => ({ default: module.ToiletReportModal })))
export const QuickReportModal = createLazyPanel<ComponentProps<typeof import('./QuickReportModal').QuickReportModal>>(() => import('./QuickReportModal').then(module => ({ default: module.QuickReportModal })))
export const MyReportsPanel = createLazyPanel<ComponentProps<typeof import('./MyReportsPanel').MyReportsPanel>>(() => import('./MyReportsPanel').then(module => ({ default: module.MyReportsPanel })))
export const AccountDialog = createLazyPanel<ComponentProps<typeof import('./AccountDialog').AccountDialog>>(() => import('./AccountDialog').then(module => ({ default: module.AccountDialog })))

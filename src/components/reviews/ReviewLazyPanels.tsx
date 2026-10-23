import { createElement, type ComponentProps } from 'react'
import { createLazyPanel } from '../../lib/createLazyPanel'
import { ReviewPanelFallback } from './ReviewPanelFallback'

export const ReviewDialog = createLazyPanel<ComponentProps<typeof import('./ReviewDialog').ReviewDialog>>(() => import('./ReviewDialog').then(module => ({ default: module.ReviewDialog })))
export const ReviewModal = createLazyPanel<ComponentProps<typeof import('./ReviewDialog').ReviewModal>>(() => import('./ReviewDialog').then(module => ({ default: module.ReviewModal })))
// The wrapper forwards props unchanged; retain the list's item subtype in its callbacks.
export const MyReviewsPanel = createLazyPanel<ComponentProps<typeof import('./MyReviewsPanel').MyReviewsPanel>>(() => import('./MyReviewsPanel').then(module => ({ default: module.MyReviewsPanel })), false, onRetry => createElement(ReviewPanelFallback, { onRetry })) as typeof import('./MyReviewsPanel').MyReviewsPanel

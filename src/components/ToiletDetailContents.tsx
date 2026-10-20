'use client'

import dynamic from 'next/dynamic'
import type { ToiletDetailResponse } from '../api/toilets'
import { DetailLoadingFields } from './ToiletCardLoading'

export { DetailRow } from './DetailRow'

// Keep exact district resolution with the detail body. The home map never
// renders this component, so it does not need the administrative polygons.
// SSR stays enabled so direct facility visits retain their public content.
const DetailBody = dynamic(() => import('./ToiletDetailBody').then(module => module.ToiletDetailBody), {
  loading: () => <DetailLoadingFields />,
})

export function ToiletDetailContents({ toilet }: { toilet: ToiletDetailResponse }) {
  return <DetailBody toilet={toilet} />
}

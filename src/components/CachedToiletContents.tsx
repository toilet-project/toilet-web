'use client'

import { useSyncExternalStore } from 'react'
import type { ToiletDetailResponse } from '../api/toilets'
import type { DetailFragment } from '../server/detailFragmentCache'
import { ToiletDetailContents } from './ToiletDetailContents'

const subscribe = () => () => {}
const hydrated = () => true
const server = () => false

export function CachedToiletContents({ toilet, fragment }: { toilet: ToiletDetailResponse; fragment: DetailFragment }) {
  const interactive = useSyncExternalStore(subscribe, hydrated, server)
  return <div style={{ display: 'contents' }} data-detail-fragment={fragment.fingerprint}>
    {interactive ? <ToiletDetailContents toilet={toilet} />
      : <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: fragment.html }} />}
  </div>
}

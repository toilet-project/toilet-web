'use client'

import { useLayoutEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMapRouteContext } from './mapRouteContext'

export function MapRouteFailure({ missing = false, retry }: { missing?: boolean; retry?: () => void }) {
  const path = usePathname()
  const { register } = useMapRouteContext()
  useLayoutEffect(() => { register({ path, detail: null }) }, [path, register])
  return <aside className="place-card initial-route-card" role="alert">
    <h1>{missing ? '화장실 정보를 찾을 수 없습니다.' : '상세 정보를 불러오지 못했습니다.'}</h1>
    <p>{missing ? '주소를 확인하거나 지도에서 다른 화장실을 찾아주세요.' : '잠시 후 다시 시도해 주세요.'}</p>
    {retry && <button type="button" className="report-entry-button" onClick={retry}>다시 시도</button>}
    <Link href="/" scroll={false}>지도로 돌아가기</Link>
  </aside>
}

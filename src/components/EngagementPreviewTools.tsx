'use client'
import { apiBaseUrl } from '../config/api'
export function EngagementPreviewTools() {
  if (process.env.NEXT_PUBLIC_TOILET_ENGAGEMENT_ENABLED !== 'true' || apiBaseUrl !== 'https://preview.geupddong.com/__review-verification') return null
  function actor(value: string, path?: string) {
    document.cookie = `engagement-preview-actor=${value}; Path=/; SameSite=Lax; Max-Age=7200${location.protocol === 'https:' ? '; Secure' : ''}`
    if (path) location.assign(path)
    else location.reload()
  }
  return <details className="engagement-preview-tools">
    <summary>기능 프리뷰 · 가상 데이터</summary>
    <p>운영과 분리된 시험 DB입니다. 아래 회원은 실제 계정이 아닙니다.</p>
    <div><button onClick={() => actor('anonymous')}>비회원</button><button onClick={() => actor('1')}>시험 회원 1</button><button onClick={() => actor('2')}>시험 회원 2</button></div>
    <div><button onClick={() => actor('1', '/account?view=likes')}>시험 회원 1 · 내 좋아요 보기</button></div>
    <nav><a href="/toilet/1">원활</a><a href="/toilet/5">5분 이상</a><a href="/toilet/4">10분 이상</a><a href="/toilet/2">15분 이상</a><a href="/toilet/3">정보 없음</a></nav>
  </details>
}

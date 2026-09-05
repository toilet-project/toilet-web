'use client'

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="app-error"><strong>화면을 불러오지 못했습니다.</strong><p>잠시 후 다시 시도해 주세요.</p><button type="button" onClick={reset}>다시 시도</button></main>
}

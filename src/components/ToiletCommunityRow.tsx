'use client'

export function ToiletCommunityRow({ onReport, pendingReport = false }: { onReport?: () => void; pendingReport?: boolean }) {
  return <div className={`toilet-community-row${onReport || pendingReport ? '' : ' is-readonly'}`}>
    <div className="toilet-community-metric" aria-label="평점: 준비 중" title="평점 기능 준비 중">
      <span><svg className="metric-star" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" /></svg>평점</span><strong>— <small>/ 5.0</small></strong>
    </div>
    <div className="toilet-community-metric" aria-label="혼잡도: 준비 중" title="혼잡도 기능 준비 중">
      <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /><circle cx="9" cy="7" r="4" /></svg>혼잡도</span><strong className="metric-pending">준비 중</strong>
    </div>
    <div className="toilet-community-metric" aria-label="휴지 있음 비율: 준비 중" title="휴지 있음 비율 기능 준비 중">
      <span><svg className="metric-paper" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><ellipse cx="6" cy="9" rx="3" ry="6" /><path d="M6 3h10c2.8 0 5 2.7 5 6v12H9V9M6 15h3M6 8v2M12 16h1m3 0h1" /></svg>휴지 있음</span><strong>—<small>%</small></strong>
    </div>
    {(onReport || pendingReport) && <button disabled={pendingReport} type="button" className="report-entry-button report-icon-button" onClick={onReport} aria-label="정보 제공하기" title="정보 제공하기">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4H5a2 2 0 0 0-2 2v15l4-3h11a2 2 0 0 0 2-2v-5" /><path d="m13 12-4 1 1-4 7-7 3 3-7 7Z" /></svg>
      <span>제보</span>
    </button>}
  </div>
}

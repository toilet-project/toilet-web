'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { AuthProfile } from '../../api/auth'
import { fetchGrowthHistoryPage, GrowthSessionExpired } from '../../api/growth'
import { useLocale } from '../../i18n/context'
import { experienceHistoryText } from '../../i18n/experienceHistoryText'
import { GROWTH_ENABLED } from '../../lib/growth'
import { growthHistoryDate, growthHistoryReason, type GrowthHistoryDirection, type GrowthHistoryPage } from '../../lib/growthHistory'

type ExperienceHistoryLayout = 'mobile' | 'desktop'

export function MobileExperienceHistory({ profile, onBack, onSessionExpired, layout = 'mobile' }: { profile: AuthProfile; onBack: () => void; onSessionExpired: () => void; layout?: ExperienceHistoryLayout }) {
  const t = experienceHistoryText(useLocale())
  const titleId = useId()
  const eligible = profile.status === 'ACTIVE' && !profile.consentRequired
  const [direction, setDirection] = useState<GrowthHistoryDirection>('earned')
  const [page, setPage] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const root = useRef<HTMLElement>(null)
  const changePage = (value: number) => {
    setPage(value)
    root.current?.closest(layout === 'desktop' ? '.account-workspace-content' : '.mobile-page')?.scrollTo({ top: 0 })
  }
  return <section ref={root} className={`experience-history${layout === 'desktop' ? ' experience-history--desktop' : ''}`} aria-labelledby={titleId}>
    <header className="experience-history-heading">{layout === 'mobile' && <button type="button" onClick={onBack} aria-label={t.back}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7" /></svg></button>}<h1 id={titleId}>{t.title}</h1></header>
    {!eligible || !GROWTH_ENABLED ? <p className="experience-history-state" role="status">{!eligible ? t.unavailable : t.preparing}</p> : <>
      <div className="experience-history-tabs" role="group" aria-label={t.title}>{(['earned', 'deducted'] as const).map(value => <button key={value} type="button" aria-pressed={direction === value} onClick={() => { setDirection(value); changePage(0) }}>{t[value]}</button>)}</div>
      <ExperienceHistoryResults key={`${profile.userId}-${direction}-${page}-${attempt}`} direction={direction} page={page} onPage={changePage} onRetry={() => setAttempt(value => value + 1)} onSessionExpired={onSessionExpired} layout={layout} />
    </>}
  </section>
}

function ExperienceHistoryResults({ direction, page, onPage, onRetry, onSessionExpired, layout }: { direction: GrowthHistoryDirection; page: number; onPage: (page: number) => void; onRetry: () => void; onSessionExpired: () => void; layout: ExperienceHistoryLayout }) {
  const t = experienceHistoryText(useLocale())
  const [result, setResult] = useState<GrowthHistoryPage | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    void fetchGrowthHistoryPage(direction, page).then(value => { if (active) setResult(value) }).catch(error => {
      if (!active) return
      if (error instanceof GrowthSessionExpired) onSessionExpired()
      setFailed(true)
    })
    return () => { active = false }
  }, [direction, page, onSessionExpired])
  if (failed) return <div className="experience-history-state" role="status"><p>{t.error}</p><button type="button" onClick={onRetry}>{t.retry}</button></div>
  if (!result) return <p className="experience-history-state" role="status">{t.loading}</p>
  return <ExperienceHistoryRecords data={result} direction={direction} onPage={onPage} layout={layout} />
}

export function ExperienceHistoryRecords({ data, direction, onPage, layout = 'mobile' }: { data: GrowthHistoryPage; direction: GrowthHistoryDirection; onPage: (page: number) => void; layout?: ExperienceHistoryLayout }) {
  const locale = useLocale(), t = experienceHistoryText(locale)
  const pages = Math.max(1, Math.ceil(data.total / data.size))
  const firstPage = Math.max(0, Math.min(data.page - 2, pages - 5))
  const pageNumbers = Array.from({ length: Math.min(5, pages) }, (_, index) => firstPage + index)
  return <>
    <div className="experience-history-caption"><span>{t.total.replace('{count}', data.total.toLocaleString(locale))}</span><span>{t.newest}</span></div>
    {data.scope === 'recent' && <p className="experience-history-limit">{t.recentLimit}</p>}
    {data.items.length ? layout === 'desktop' ? <div className="experience-history-table-wrap"><table className="experience-history-table" aria-label={t.title}>
      <thead><tr><th scope="col">{t.orderNumber}</th><th scope="col">{t.activity}</th><th scope="col">{t.date}</th><th scope="col">{t.experience}</th></tr></thead>
      <tbody>{data.items.map((item, index) => {
        const date = growthHistoryDate(item.happenedAt)
        return <tr key={item.id}>
          <td className="experience-history-order">{(data.page * data.size + index + 1).toLocaleString(locale)}</td>
          <td><span className="experience-history-activity">{t[growthHistoryReason(item.reason)]}</span></td>
          <td><time dateTime={date?.toISOString()}>{date ? new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date) : '—'}</time></td>
          <td><strong className={item.deltaXp < 0 ? 'is-deducted' : ''}>{item.deltaXp > 0 ? '+' : '−'}{Math.abs(item.deltaXp).toLocaleString(locale)}<small> XP</small></strong></td>
        </tr>
      })}</tbody>
    </table></div> : <ol className="experience-history-list">{data.items.map(item => {
      const date = growthHistoryDate(item.happenedAt)
      return <li key={item.id}><span className={`experience-history-sign${item.deltaXp < 0 ? ' is-deducted' : ''}`} aria-hidden="true">{item.deltaXp > 0 ? '+' : '−'}</span><div><h2>{t[growthHistoryReason(item.reason)]}</h2><time dateTime={date?.toISOString()}>{date ? new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date) : '—'}</time></div><strong className={item.deltaXp < 0 ? 'is-deducted' : ''}>{item.deltaXp > 0 ? '+' : '−'}{Math.abs(item.deltaXp).toLocaleString(locale)}<small> XP</small></strong></li>
    })}</ol> : <div className="experience-history-empty"><span aria-hidden="true">{direction === 'earned' ? '+' : '−'}</span><p>{direction === 'earned' ? t.emptyEarned : t.emptyDeducted}</p></div>}
    {(layout === 'desktop' || pages > 1) && <nav className="experience-history-pagination" aria-label={t.pagination}><button type="button" aria-label={t.previous} disabled={data.page === 0} onClick={() => onPage(data.page - 1)}>‹</button>{pageNumbers.map(value => <button key={value} type="button" aria-label={`${t.page} ${value + 1}`} aria-current={value === data.page ? 'page' : undefined} onClick={() => onPage(value)}>{value + 1}</button>)}<button type="button" aria-label={t.next} disabled={data.page + 1 >= pages} onClick={() => onPage(data.page + 1)}>›</button></nav>}
  </>
}

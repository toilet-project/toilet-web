'use client'

import type { CSSProperties } from 'react'
import Link from 'next/link'
import { useLocale } from '../../i18n/context'
import { growthText } from '../../i18n/growthText'
import { growthMobileText } from '../../i18n/growthMobileText'
import { experienceHistoryText } from '../../i18n/experienceHistoryText'
import { localizedPublicPath } from '../../i18n/routes'
import { GROWTH_ENABLED, growthRanks } from '../../lib/growth'
import type { GrowthState } from '../../lib/growthStore'
import { GrowthStatus } from './GrowthStatus'
import { RankIcon } from './RankIcon'

export function MobileGrowthSummary({ state, onHistory }: { state: GrowthState & { refresh: () => void }; onHistory?: () => void }) {
  const locale = useLocale(), t = growthText(locale), mobile = growthMobileText(locale)
  const summary = state.summary
  const rankIndex = summary ? growthRanks.findIndex(rank => rank.key === summary.rank) : -1
  const rank = rankIndex >= 0 ? growthRanks[rankIndex] : null
  const style = rank ? { '--mobile-growth-color': rank.color, '--mobile-growth-soft': rank.soft, '--mobile-growth-bar': rank.bar } as CSSProperties : undefined

  return <section className="mobile-growth-summary" aria-label={t.growthGuide} style={style}>
    {summary && rank ? <div className="mobile-growth-body">
      <div className="mobile-growth-current"><RankIcon rank={summary.rank} size={40} decorative /><div><strong>Lv.{summary.level}</strong><span>{t.ranks[rankIndex]}</span></div></div>
      <div className="mobile-growth-next"><span>{t.nextLevel} <b>Lv.{summary.nextLevel}</b></span><strong>{summary.remainingXp.toLocaleString(locale)} <small>XP</small></strong></div>
      <div className="mobile-growth-track"><div role="progressbar" aria-label={`${t.nextLevel} Lv.${summary.nextLevel}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.progressPercent} style={{ width: `${summary.progressPercent}%` }} /></div>
      {state.checkInError && <GrowthStatus state={state} retry={state.refresh} />}
    </div> : <GrowthStatus state={state} retry={state.refresh} />}
    <nav className="mobile-growth-links" aria-label={t.growthGuide}>
      <Link href={localizedPublicPath('/growth/ranks', locale)!}>{mobile.ranksTab}</Link>
      <Link href={localizedPublicPath('/growth/levels', locale)!}>{mobile.levelsTab}</Link>
      {GROWTH_ENABLED && onHistory && <button type="button" onClick={onHistory}>{experienceHistoryText(locale).title}</button>}
    </nav>
  </section>
}

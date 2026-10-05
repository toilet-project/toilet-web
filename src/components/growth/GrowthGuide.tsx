'use client'
import { useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { getCurrentUser, type AuthProfile } from '../../api/auth'
import { useLocale } from '../../i18n/context'
import { growthText } from '../../i18n/growthText'
import { growthMobileText } from '../../i18n/growthMobileText'
import { localizedPublicPath } from '../../i18n/routes'
import { GROWTH_ENABLED, growthRanks, growthRankFor, growthTotalXp, type GrowthSummary } from '../../lib/growth'
import { useGrowth } from '../../lib/useGrowth'
import { RankIcon } from './RankIcon'
import { GrowthStatus } from './GrowthStatus'

type Rank = typeof growthRanks[number]
function rankStyle(rank: Rank): CSSProperties { return { '--rank-color': rank.color, '--rank-soft': rank.soft, '--rank-bar': rank.bar } as CSSProperties }
function range(rank: Rank) { return rank.max === null ? `Lv.${rank.min}+` : `Lv.${rank.min}–${rank.max}` }
function GuideLabel({ full, compact }: { full: string; compact: string }) { return <><span className="guide-desktop-label">{full}</span><span className="guide-mobile-label">{compact}</span></> }

export function GrowthGuide({ page }: { page: 'ranks' | 'levels' }) {
  const locale = useLocale(), t = growthText(locale), mobile = growthMobileText(locale)
  const [profile, setProfile] = useState<AuthProfile | null>(null), [profileLoading, setProfileLoading] = useState(GROWTH_ENABLED)
  useEffect(() => { if (!GROWTH_ENABLED) return; let active = true; void getCurrentUser().then(value => { if (active) setProfile(value) }).catch(() => undefined).finally(() => { if (active) setProfileLoading(false) }); return () => { active = false } }, [])
  const state = useGrowth(profile?.status === 'ACTIVE' && !profile.consentRequired ? profile.userId : null)
  const url = (path: string) => localizedPublicPath(path, locale)!
  return <main className="growth-guide" aria-labelledby="growth-page-title"><div className="guide-shell"><h1 id="growth-page-title" className="sr-only">{page === 'ranks' ? t.rankGuide : t.levelGuide}</h1>
    <div className="guide-nav"><Link className="guide-back" href={url('/?tab=account')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>{mobile.backAccount}</Link><nav className="breadcrumb" aria-label={t.growthGuide}><Link href={url('/')}>급똥</Link><span aria-hidden="true">/</span><span>{t.growthGuide}</span></nav><nav className="guide-tabs" aria-label={t.growthGuide}><Link href={url('/growth/ranks')} aria-current={page === 'ranks' ? 'page' : undefined}><GuideLabel full={t.rankGuide} compact={mobile.ranksTab} /></Link><Link href={url('/growth/levels')} aria-current={page === 'levels' ? 'page' : undefined}><GuideLabel full={t.levelGuide} compact={mobile.levelsTab} /></Link></nav></div>
    {page === 'ranks' ? <RankCollection /> : <div className="level-dashboard"><EarningMethods /><section className="planning-column" aria-labelledby="growth-goal-title"><div className="section-heading"><h2 id="growth-goal-title"><GuideLabel full={t.goalTitle} compact={mobile.goalTitle} /></h2></div>
      {state.summary || !GROWTH_ENABLED || (!profileLoading && !profile) ? <GoalCalculator summary={state.summary} /> : <div className="goal-card growth-unavailable"><GrowthStatus state={state} retry={state.refresh} /></div>}
      {state.summary && state.checkInError && <GrowthStatus state={state} retry={state.refresh} />}
      <RankRanges summary={state.summary} />
    </section></div>}
    <footer className="footer"><p>{t.support}</p>{!GROWTH_ENABLED && <p className="page-note">{t.preparing}</p>}<Link href={url('/')}>{t.backMap} ↗</Link></footer>
  </div></main>
}

function RankCollection() {
  const locale = useLocale(), t = growthText(locale), [selected, setSelected] = useState(6)
  const rank = growthRanks[selected], next = growthRanks[selected + 1]
  return <><section aria-labelledby="growth-collection-title"><div className="section-heading"><h2 id="growth-collection-title">{t.collectionTitle}</h2><p>{t.choose} ↘</p></div>
    <div className="rank-path"><div className="rank-gallery" role="group" aria-label={t.rankGuide}>{growthRanks.map((item, index) => <button key={item.key} type="button" className="rank-card" style={rankStyle(item)} aria-pressed={selected === index} onClick={() => setSelected(index)}><span className="card-index"><span>0{index + 1}</span><i className="card-dot" /></span><span className="rank-art"><RankIcon rank={item.key} size={96} decorative /></span><span className="rank-name">{t.ranks[index]}</span><span className="rank-range">{range(item)}</span></button>)}</div>
    <div className="level-track-viewport"><div className="level-track" role="group" aria-label={t.levels}>{growthRanks.map((item, index) => <button key={item.key} type="button" className="level-step" style={rankStyle(item)} aria-pressed={selected === index} onClick={() => setSelected(index)} aria-label={`${t.ranks[index]}, ${range(item)}`}><span className="level-color" /><span className="level-start"><strong><GuideLabel full={`Lv.${item.min}`} compact={range(item)} /></strong>{item.max === null && <span className="level-open guide-desktop-label">+ →</span>}</span></button>)}</div></div>
    </div><article className="rank-detail" style={rankStyle(rank)}><div className="detail-main"><div className="detail-art"><RankIcon rank={rank.key} size={120} /></div><div className="detail-copy"><p className="small-label">{t.selected}</p><h3>{t.ranks[selected]}</h3><p>{t.growthMessage}</p><div className="detail-metrics"><span className="detail-level">{range(rank)}</span><span className="detail-xp">{t.cumulative} <strong>{growthTotalXp(rank.min).toLocaleString(locale)}</strong> {t.from}</span></div></div></div><div className="detail-example"><div className="example-top"><h3>{t.exampleHeading}</h3><span className="example-chip">{t.example}</span></div><div className="example-author"><RankIcon rank={rank.key} size={24} /><b>Lv.{rank.min}</b><strong>{t.exampleName}</strong></div><p className="example-text">{t.exampleReview.split('\n').map((line, index) => <span key={line}>{index > 0 && <br />}{line}</span>)}</p><div className="example-footer"><span>{t.ranks[selected]}</span></div></div></article><p className="rank-next" role="status" aria-live="polite">{next ? `${t.nextRank} Lv.${next.min} ${t.ranks[selected + 1]}` : t.after40}</p></section>
    <section className="growth-bottom"><div className="steps">{[[t.methodTitle, t.methodNote], [t.levelGuide, t.progress], [t.rankGuide, t.nextRank]].map(([title, description], index) => <div className="step" key={title}><span className="num">0{index + 1}</span><h3>{title}</h3><p>{description}</p></div>)}</div><Link href={localizedPublicPath('/growth/levels', locale)!} className="next-guide"><div><p>{t.nextLevel}</p><strong>{t.earnGuide}</strong></div><span aria-hidden="true">↗</span></Link></section>
  </>
}

function EarningMethods() {
  const locale = useLocale(), t = growthText(locale), mobile = growthMobileText(locale)
  const rewards = [[t.district, 20, 'district'], [t.bronze, 30, 'bronze'], [t.silver, 50, 'silver'], [t.gold, 100, 'gold']] as const
  const symbol = (kind: 'review' | 'daily' | 'badge') => <span className="earn-icon" aria-hidden="true"><svg viewBox="0 0 24 24">{kind === 'review' ? <path d="M14 5H6a2 2 0 0 0-2 2v13h13a2 2 0 0 0 2-2v-7M14 4l3-2 5 5-2 3-8 8-5 1 1-5zM14 4l6 6" /> : kind === 'daily' ? <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4m8-4v4M4 10h16m-12 5 3 3 5-5" /></> : <><circle cx="12" cy="9" r="6" /><path d="m8 14-2 7 6-3 6 3-2-7M10 9l1.5 1.5L15 7" /></>}</svg></span>
  return <section className="earning-column" aria-labelledby="growth-earning-title"><div className="section-heading"><h2 id="growth-earning-title">{t.methodTitle}</h2><p>{t.methodNote}</p></div><div className="earning-stack">
    <article className="earn-card earn-review">{symbol('review')}<div className="earn-copy"><span className="earn-frequency">{t.reviewOnce}</span><h3><GuideLabel full={t.reviewTitle} compact={mobile.reviewTitle} /></h3><p>{t.reviewDescription}</p><span className="earn-small">{t.reviewNote}</span></div><div className="earn-amount"><strong>+10</strong><span>XP</span></div></article>
    <article className="earn-card earn-visit">{symbol('daily')}<div className="earn-copy"><span className="earn-frequency"><GuideLabel full={t.daily} compact={mobile.dailyCondition} /></span><h3><GuideLabel full={t.visitTitle} compact={mobile.visitTitle} /></h3><p>{t.visitDescription}</p></div><div className="earn-amount"><strong>+2</strong><span>XP</span></div></article>
    <article className="earn-badges"><div className="earn-badge-heading">{symbol('badge')}<div className="earn-copy"><span className="earn-frequency">{t.badgeOnce}</span><h3><GuideLabel full={t.badgeTitle} compact={mobile.badgeTitle} /></h3><p>{t.badgeDescription}</p></div></div><div className="earn-badge-grid">{rewards.map(([name, xp, tier]) => <div key={tier}><span><i className={`reward-dot ${tier}`} />{name}</span><strong>+{xp} <small>XP</small></strong></div>)}</div><p className="earn-small">{t.badgeNote}</p></article>
  </div></section>
}

function GoalCalculator({ summary }: { summary: GrowthSummary | null }) {
  const locale = useLocale(), t = growthText(locale), mobile = growthMobileText(locale)
  const currentLevel = summary?.level ?? 0, currentXp = summary?.totalXp ?? 0
  const nextRank = growthRanks.find(rank => rank.min > currentLevel)
  const [chosen, setChosen] = useState(summary ? nextRank?.min ?? currentLevel + 1 : 0)
  const minimum = summary ? currentLevel + 1 : 0
  const [extra, setExtra] = useState(0), maximum = minimum + 100 + extra
  const target = Math.max(minimum, chosen), targetXp = Math.max(0, growthTotalXp(target)), remaining = Math.max(0, targetXp - currentXp)
  const rank = growthRankFor(target), currentRank = growthRankFor(currentLevel), progress = targetXp ? Math.min(100, currentXp / targetXp * 100) : 0
  return <article className="goal-card"><div className="member-summary"><div className="member-identity"><RankIcon rank={summary?.rank ?? 'white'} size={36} /><div><strong>{summary ? `Lv.${currentLevel}` : t.guestCalculator}</strong><span>{summary ? t.ranks[growthRanks.indexOf(currentRank)] : t.guestCalculatorNote}</span></div></div>{summary && <p><GuideLabel full={t.memberXp} compact={mobile.earnedXp} /><strong>{currentXp.toLocaleString(locale)}</strong> XP</p>}</div><div className="goal-calculation"><div className="goal-form"><label htmlFor="growth-goal-level">{t.targetLevel}</label><div className="goal-input-group"><span>Lv.</span><select id="growth-goal-level" value={target} onChange={event => { if (event.target.value === 'more') setExtra(value => value + 100); else setChosen(Number(event.target.value)) }}>{Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index).map(level => <option key={level} value={level}>{level}</option>)}<option value="more">{t.moreLevels} +100</option></select></div></div><div className="goal-result" aria-live="polite"><RankIcon rank={rank.key} size={40} /><div><p><GuideLabel full={t.remaining} compact={mobile.remaining} /></p><strong>{remaining.toLocaleString(locale)}</strong><span className="goal-unit"> XP</span></div></div></div><div className="goal-rail"><div role="progressbar" aria-label={t.targetLevel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} style={{ width: `${progress}%` }} /></div><div className="goal-meta"><span>{target === 0 ? t.selectGoal : `Lv.${target} · ${t.cumulative} ${targetXp.toLocaleString(locale)} XP`}</span>{target > 0 && <b>{t.ranks[growthRanks.indexOf(rank)]}</b>}</div></article>
}

function RankRanges({ summary }: { summary: GrowthSummary | null }) {
  const locale = useLocale(), t = growthText(locale), mobile = growthMobileText(locale)
  return <article className="range-panel"><div className="range-title"><h3><GuideLabel full={t.rangeTitle} compact={mobile.rangeTitle} /></h3><span>{t.rangeNote}</span></div><table className="range-table"><caption className="sr-only">{t.rangeTitle}</caption><thead><tr><th scope="col">{t.rank}</th><th scope="col">{t.levels}</th><th scope="col">{t.xp}</th></tr></thead><tbody>{growthRanks.map((rank, index) => <tr key={rank.key} className={summary?.rank === rank.key ? 'is-current' : undefined}><th scope="row"><span className="table-rank"><RankIcon rank={rank.key} size={24} decorative /><span>{t.ranks[index]}</span>{summary?.rank === rank.key && <span className="range-current-label">{t.current}</span>}</span></th><td>{range(rank)}</td><td>{growthTotalXp(rank.min).toLocaleString(locale)}{growthRanks[index + 1] ? `–${(growthTotalXp(growthRanks[index + 1].min) - 1).toLocaleString(locale)}` : '+'}<span className="xp-unit"> XP</span></td></tr>)}</tbody></table><p className="range-note">{t.rangeFooter}</p></article>
}

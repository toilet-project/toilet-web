'use client'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import type { AuthProfile } from '../../api/auth'
import { useLocale } from '../../i18n/context'
import { achievementText } from '../../i18n/achievementText'
import { localizedPublicPath } from '../../i18n/routes'
import { GROWTH_ENABLED, type GrowthBadge, type GrowthSummary, type MedalTier } from '../../lib/growth'
import { growthBadgePath } from '../../lib/growthBadgeAssets'
import { growthAchievementRegions, growthAchievementName, growthAchievementKey, growthEarnedAchievements, growthHighestRegionalAwards, growthBronzeGoal, growthMedalTiers, growthMedalProgress, growthNextMedalProgress, type GrowthMedalProgress } from '../../lib/growthAchievements'
import { useGrowth } from '../../lib/useGrowth'
import { useDialogFocus } from '../../lib/useDialogFocus'
import { urlName } from '../../lib/urlName'
import { GrowthStatus } from './GrowthStatus'

type CollectionItem = { type: GrowthBadge['type']; code: string; tier: MedalTier | null; name: string; regionCode: string }
type Filter = 'all' | 'earned' | 'locked'

function Mark({ kind }: { kind: 'back' | 'check' | 'lock' | 'close' | 'chevron' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === 'back' ? <path d="m14 5-7 7 7 7" /> : kind === 'check' ? <path d="m5 12 4 4L19 6" /> : kind === 'lock' ? <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" /></> : kind === 'close' ? <path d="m6 6 12 12M6 18 18 6" /> : <path d="m9 5 7 7-7 7" />}</svg>
}

function BadgeArt({ item, size = 64, locked = false }: { item: Pick<CollectionItem, 'type' | 'code' | 'tier'>; size?: number; locked?: boolean }) {
  const src = growthBadgePath(item, size)
  return src ? <img className={`achievement-art${locked ? ' is-locked' : ''}`} src={src} alt="" width={size} height={size} loading="lazy" /> : <span className="achievement-art-fallback" aria-hidden="true">◇</span>
}

function ProgressRows({ progress }: { progress: GrowthMedalProgress }) {
  const t = achievementText(useLocale())
  return <div className="achievement-progress-rows">{[{ label: t.facilities, value: progress.facilities }, { label: t.districts, value: progress.districts }].map(({ label, value }) => {
    return <div key={String(label)}><div><span>{String(label)}</span><b>{value.count} <small>/ {value.required}</small>{value.remaining === 0 && <Mark kind="check" />}</b></div><div className="achievement-meter" role="progressbar" aria-label={String(label)} aria-valuemin={0} aria-valuemax={value.required} aria-valuenow={Math.min(value.required, value.count)}><i style={{ width: `${Math.min(100, value.count / value.required * 100)}%` }} /></div></div>
  })}</div>
}

export function MobileAchievements({ profile, onBack, onSessionExpired }: { profile: AuthProfile; onBack: () => void; onSessionExpired: () => void }) {
  const eligible = profile.status === 'ACTIVE' && !profile.consentRequired
  const state = useGrowth(GROWTH_ENABLED && eligible ? profile.userId : null)
  const t = achievementText(useLocale())
  useEffect(() => { if (state.status === 'signedOut') onSessionExpired() }, [state.status, onSessionExpired])
  return <section className="achievement-page" aria-labelledby="achievement-title">
    <header className="achievement-heading"><button type="button" onClick={onBack} aria-label={t.back}><Mark kind="back" /></button><h1 id="achievement-title">{t.title}</h1><span aria-hidden="true">✦</span></header>
    {!eligible ? <p className="achievement-empty" role="status">{t.unavailable}</p> : state.summary ? <><AchievementCollection summary={state.summary} />{state.checkInError && <GrowthStatus state={state} retry={state.refresh} />}</> : <div className="achievement-loading"><GrowthStatus state={state} retry={state.refresh} /></div>}
  </section>
}

/** The collection never derives ownership from progress or from a preview illustration. */
export function AchievementCollection({ summary }: { summary: GrowthSummary }) {
  const locale = useLocale(), t = achievementText(locale)
  const awards = useMemo(() => growthEarnedAchievements(summary), [summary])
  const regionalAwards = useMemo(() => growthHighestRegionalAwards(summary), [summary])
  const initialRegion = [...summary.regions].sort((a, b) => b.earnedDistricts - a.earnedDistricts || b.distinctFacilities - a.distinctFacilities).find(region => growthAchievementRegions.some(item => item.code === region.code))?.code ?? '11'
  const [regionCode, setRegionCode] = useState('all')
  const [tab, setTab] = useState<'district' | 'regional_medal'>('regional_medal')
  const [filter, setFilter] = useState<Filter>('all')
  const [limit, setLimit] = useState(30)
  const [selected, setSelected] = useState<CollectionItem | null>(null)
  const region = growthAchievementRegions.find(item => item.code === regionCode)
  const record = summary.regions.find(item => item.code === regionCode)
  const next = growthNextMedalProgress(record)
  const bronzeGoal = growthBronzeGoal(summary, regionCode)
  const districtCount = [...awards.values()].filter(badge => badge.type === 'district').length
  const medalCount = regionalAwards.size
  const collectionCount = districtCount + medalCount
  const featured = [...regionalAwards.values(), ...[...awards.values()].filter(badge => badge.type === 'district')].slice(0, 3)
  const collectionRegions = new Set([...awards.values()].map(badge => badge.type === 'district' ? badge.code.slice(0, 2) : badge.code)).size
  const regions = region ? [region] : growthAchievementRegions
  const items = regions.flatMap<CollectionItem>(item => tab === 'district'
    ? item.districts.map(district => ({ ...district, type: 'district' as const, tier: null, name: growthAchievementName(district, locale) }))
    : [{ type: 'regional_medal', code: item.code, regionCode: item.code, tier: regionalAwards.get(item.code)?.tier ?? 'bronze', name: growthAchievementName(item, locale) }])
  // Keep awards from earlier policies visible even if their design left the current catalog.
  const catalogKeys = new Set(items.map(growthAchievementKey))
  for (const badge of tab === 'regional_medal' ? regionalAwards.values() : awards.values()) {
    const awardRegion = badge.type === 'district' ? badge.code.slice(0, 2) : badge.code
    if (badge.type === tab && (!region || awardRegion === region.code) && !catalogKeys.has(growthAchievementKey(badge))) {
      items.push({ ...badge, regionCode: awardRegion, name: growthAchievementName(badge, locale) })
    }
  }
  const isEarned = (item: CollectionItem) => item.type === 'regional_medal' ? regionalAwards.has(item.code) : awards.has(growthAchievementKey(item))
  const matching = items.filter(item => filter === 'all' || (filter === 'earned') === isEarned(item))
    .sort((a, b) => Number(isEarned(b)) - Number(isEarned(a)))
  const visible = matching.slice(0, limit)
  const ownedHere = items.filter(isEarned).length
  const resetView = () => { setLimit(30); setSelected(null) }
  return <>
    <section className="achievement-cover" aria-label={t.collected}>
      <div className="achievement-cover-top"><div><p>{t.collectionTitle}</p><strong>{collectionCount.toLocaleString(locale)}<span>{t.collected}</span></strong></div><div className="achievement-cover-art" aria-hidden="true">{featured.length ? featured.map(badge => <BadgeArt key={growthAchievementKey(badge)} item={badge} size={68} />) : <BadgeArt item={{ type: 'regional_medal', code: initialRegion, tier: 'gold' }} size={78} locked />}</div></div>
      <div className="achievement-cover-stats"><span>{t.medalTab}<b>{medalCount}</b></span><span>{t.badgeTab}<b>{districtCount}</b></span><span>{t.collectedRegions}<b>{collectionRegions}</b></span></div>
      {!collectionCount && <p className="achievement-first-note">{t.emptyCollection}</p>}
    </section>

    <div className="achievement-tabs" role="group" aria-label={t.total}>
      <button type="button" aria-pressed={tab === 'regional_medal'} onClick={() => { setTab('regional_medal'); resetView() }}>{t.medalTab}<span>{medalCount}</span></button>
      <button type="button" aria-pressed={tab === 'district'} onClick={() => { setTab('district'); resetView() }}>{t.badgeTab}<span>{districtCount}</span></button>
    </div>

    <div className="achievement-region-picker"><label htmlFor="achievement-region">{t.region}</label><select id="achievement-region" value={regionCode} onChange={event => { setRegionCode(event.target.value); resetView() }}><option value="all">{t.allRegions}</option>{growthAchievementRegions.map(item => <option key={item.code} value={item.code}>{growthAchievementName(item, locale)}</option>)}</select><span>{t.earned} <b>{ownedHere}</b></span></div>

    {tab === 'regional_medal' && filter !== 'earned' && bronzeGoal && <BronzeGoalCard goal={bronzeGoal} first={medalCount === 0} onDetails={() => setSelected({ type: 'regional_medal', code: bronzeGoal.region.code, regionCode: bronzeGoal.region.code, tier: 'bronze', name: growthAchievementName(bronzeGoal.region, locale) })} />}

    {tab === 'district' && region && record && <div className="achievement-region-status"><div><span>{t.regionCollection}</span><strong>{record.earnedDistricts} <small>/ {record.targetDistricts}</small></strong></div><div className="achievement-meter" role="progressbar" aria-label={t.regionCollection} aria-valuemin={0} aria-valuemax={Math.max(1, record.targetDistricts)} aria-valuenow={Math.min(record.targetDistricts, record.earnedDistricts)}><i style={{ width: `${record.targetDistricts ? Math.min(100, record.earnedDistricts / record.targetDistricts * 100) : 0}%` }} /></div></div>}

    {tab === 'district' && region && next && <button type="button" className="achievement-next" onClick={() => setSelected({ type: 'regional_medal', code: region.code, regionCode: region.code, tier: next.tier, name: growthAchievementName(region, locale) })}>
      <BadgeArt item={{ type: 'regional_medal', code: region.code, tier: next.tier }} size={44} /><span><small>{t.nextStageCondition}</small><strong>{growthAchievementName(region, locale)} · {t[next.tier]}</strong><em>{t.facilities} {next.facilities.count}/{next.facilities.required} · {t.districts} {next.districts.count}/{next.districts.required}</em></span><Mark kind="chevron" />
    </button>}

    <div className="achievement-filter-row"><div role="group" aria-label={t.earnedOnly}>{(['all', 'earned', 'locked'] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setLimit(30) }}>{t[value]}</button>)}</div><span aria-live="polite">{matching.length}</span></div>

    <div className="achievement-sticker-book" aria-label={tab === 'district' ? t.badgeTab : t.medalTab}>
      {visible.length ? <div className="achievement-grid">{visible.map(item => {
        const key = growthAchievementKey(item), earned = isEarned(item)
        const regional = item.type === 'regional_medal'
        const currentTier = regionalAwards.get(item.code)?.tier
        const stage = currentTier ? growthMedalTiers.indexOf(currentTier) + 1 : 0
        return <button type="button" key={key} className={`achievement-sticker ${earned ? 'is-earned' : 'is-locked'}`} aria-label={`${item.name} · ${earned ? t.earned : t.locked}${regional ? ` · ${t.stage} ${stage}/3` : ''}`} onClick={() => setSelected(item)}>
          <span className="achievement-sticker-art"><BadgeArt item={item} size={72} locked={!earned} /><span className="achievement-sticker-status"><Mark kind={earned ? 'check' : 'lock'} /></span></span><strong>{item.name}</strong>{regional && <span className="achievement-stage-track" aria-hidden="true">{growthMedalTiers.map(tier => <i key={tier} className={awards.has(growthAchievementKey({ ...item, tier })) ? `is-earned is-${tier}` : ''} />)}</span>}<span>{regional ? `${t.stage} ${stage}/3` : earned ? t.earned : t.locked}</span>
        </button>
      })}</div> : <p className="achievement-empty">{t.emptyFilter}</p>}
      {matching.length > limit && <button type="button" className="achievement-more" onClick={() => setLimit(value => value + 30)}>{t.more} <span>{visible.length} / {matching.length}</span></button>}
    </div>
    <p className="achievement-policy-note">{t.policyNote}{regions.some(item => summary.regions.find(value => value.code === item.code)?.targetDistricts !== item.districts.length) && <> {t.policyDifference}</>}</p>
    {selected && <AchievementDetail item={selected} summary={summary} awards={awards} onClose={() => setSelected(null)} />}
  </>
}

function BronzeGoalCard({ goal, first, onDetails }: { goal: NonNullable<ReturnType<typeof growthBronzeGoal>>; first: boolean; onDetails: () => void }) {
  const locale = useLocale(), t = achievementText(locale)
  const name = growthAchievementName(goal.region, locale)
  const label = first ? t.firstBronzeGoal : t.anotherBronzeGoal
  const { facilities, districts } = goal.progress
  const message = facilities.count === 0 && districts.count === 0 ? t.bronzeStart
    : facilities.remaining > 0 ? t.bronzeReviewsLeft.replace('{count}', String(facilities.remaining))
      : t.bronzeDistrictsLeft.replace('{count}', String(districts.remaining))
  const path = localizedPublicPath(`/regions/${urlName(name)}-${goal.region.code}`, locale)!
  return <section className="achievement-bronze-goal" aria-label={label}>
    <div className="achievement-bronze-goal-main"><BadgeArt item={{ type: 'regional_medal', code: goal.region.code, tier: 'bronze' }} size={50} /><div><small>{label}</small><h2>{name} · {t.bronze}</h2><p>{message}</p></div></div>
    <div className="achievement-bronze-goal-counts">{[{ label: t.facilities, value: facilities }, { label: t.districts, value: districts }].map(({ label: metricLabel, value }) => <span key={metricLabel}><span>{metricLabel}</span><b>{value.count}<small>/{value.required}</small></b>{value.remaining === 0 && <Mark kind="check" />}</span>)}</div>
    <div className="achievement-bronze-goal-actions"><button type="button" onClick={onDetails}>{t.viewGoal}</button><Link href={path} prefetch={false}>{t.findToilets}<Mark kind="chevron" /></Link></div>
  </section>
}

function AchievementDetail({ item, summary, awards, onClose }: { item: CollectionItem; summary: GrowthSummary; awards: ReadonlyMap<string, GrowthBadge>; onClose: () => void }) {
  const locale = useLocale(), t = achievementText(locale)
  const [tier, setTier] = useState<MedalTier>(item.tier ?? 'bronze')
  const regional = item.type === 'regional_medal'
  const shown = regional ? { ...item, tier } : item
  const earned = awards.get(growthAchievementKey(shown))
  const highestTier = growthHighestRegionalAwards(summary).get(item.code)?.tier
  const dialog = useDialogFocus(true, onClose)
  const region = growthAchievementRegions.find(value => value.code === item.regionCode)
  const district = item.type === 'district' ? region?.districts.find(value => value.code === item.code) : undefined
  const regionLabel = region ? growthAchievementName(region, locale) : ''
  const progress = regional ? growthMedalProgress(summary.regions.find(value => value.code === item.regionCode), tier) : null
  const path = region ? `/regions/${urlName(regionLabel)}-${region.code}${district ? `/${urlName(growthAchievementName(district, locale))}-${district.code}` : ''}` : null
  const earnedDate = earned ? new Date(earned.earnedAt) : null
  return createPortal(<div className="achievement-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section ref={dialog} className="achievement-detail" role="dialog" aria-modal="true" aria-labelledby="achievement-detail-title" tabIndex={-1}>
    <button type="button" className="achievement-close" onClick={onClose} aria-label={t.close}><Mark kind="close" /></button>
    <div className="achievement-detail-hero"><span className={`achievement-state-pill${earned ? ' is-earned' : ''}`}><Mark kind={earned ? 'check' : 'lock'} />{earned ? t.earned : t.locked}</span><BadgeArt item={shown} size={120} /><p>{regional ? t.medalTab : regionLabel}</p><h2 id="achievement-detail-title">{item.name}</h2></div>
    {regional && <div className="achievement-stage-section"><p>{t.currentStage}<b>{highestTier ? t[highestTier] : t.locked}</b></p><div className="achievement-stage-options" role="group" aria-label={t.stage}>{growthMedalTiers.map((value, index) => <button key={value} type="button" className={`is-${value}`} aria-pressed={tier === value} onClick={() => setTier(value)}><span>{index + 1}</span><strong>{t[value]}</strong><small>{awards.has(growthAchievementKey({ ...item, tier: value })) ? t.earned : t.locked}</small></button>)}</div></div>}
    {earned && <dl className="achievement-earned-facts"><div><dt>{t.earnedOn}</dt><dd>{earnedDate && Number.isFinite(earnedDate.getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(earnedDate) : '—'}</dd></div><div><dt>{t.earnedXp}</dt><dd>+{earned.xp} XP</dd></div></dl>}
    <div className="achievement-condition"><h3>{regional ? `${t[tier]} · ${t.condition}` : t.condition}</h3>{item.type === 'district' ? <p>{t.districtCondition}</p> : progress ? <ProgressRows progress={progress} /> : <p>{t.noProgress}</p>}<p className="achievement-condition-note">{t.reviewRule}</p></div>
    {path && <Link href={localizedPublicPath(path, locale)!} prefetch={false} className="achievement-find">{t.findToilets}<Mark kind="chevron" /></Link>}
  </section></div>, document.body)
}

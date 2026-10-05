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
import { growthAchievementRegions, growthAchievementName, growthAchievementKey, growthEarnedAchievements, growthMedalTiers, growthMedalProgress, growthNextMedalProgress, type GrowthMedalProgress } from '../../lib/growthAchievements'
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
  const initialRegion = [...summary.regions].sort((a, b) => b.earnedDistricts - a.earnedDistricts || b.distinctFacilities - a.distinctFacilities).find(region => growthAchievementRegions.some(item => item.code === region.code))?.code ?? '11'
  const [regionCode, setRegionCode] = useState(initialRegion)
  const [tab, setTab] = useState<'district' | 'regional_medal'>('district')
  const [filter, setFilter] = useState<Filter>('all')
  const [limit, setLimit] = useState(30)
  const [selected, setSelected] = useState<CollectionItem | null>(null)
  const region = growthAchievementRegions.find(item => item.code === regionCode)
  const record = summary.regions.find(item => item.code === regionCode)
  const next = growthNextMedalProgress(record)
  const districtCount = [...awards.values()].filter(badge => badge.type === 'district').length
  const medalCount = [...awards.values()].filter(badge => badge.type === 'regional_medal').length
  const featured = [...awards.values()].sort((a, b) => b.earnedAt.localeCompare(a.earnedAt)).slice(0, 3)
  const collectionRegions = new Set([...awards.values()].map(badge => badge.type === 'district' ? badge.code.slice(0, 2) : badge.code).filter(code => growthAchievementRegions.some(item => item.code === code))).size
  const regions = region ? [region] : growthAchievementRegions
  const items = regions.flatMap<CollectionItem>(item => tab === 'district'
    ? item.districts.map(district => ({ ...district, type: 'district' as const, tier: null, name: growthAchievementName(district, locale) }))
    : growthMedalTiers.map(tier => ({ type: 'regional_medal' as const, code: item.code, regionCode: item.code, tier, name: region ? t[tier] : `${growthAchievementName(item, locale)} · ${t[tier]}` })))
  // Keep awards from earlier policies visible even if their design left the current catalog.
  const catalogKeys = new Set(items.map(growthAchievementKey))
  for (const badge of awards.values()) {
    const awardRegion = badge.type === 'district' ? badge.code.slice(0, 2) : badge.code
    if (badge.type === tab && (!region || awardRegion === region.code) && !catalogKeys.has(growthAchievementKey(badge))) {
      items.push({ ...badge, regionCode: awardRegion, name: growthAchievementName(badge, locale) })
    }
  }
  const matching = items.filter(item => filter === 'all' || (filter === 'earned') === awards.has(growthAchievementKey(item)))
  const visible = matching.slice(0, limit)
  const ownedHere = items.filter(item => awards.has(growthAchievementKey(item))).length
  const resetView = () => { setLimit(30); setSelected(null) }
  return <>
    <section className="achievement-cover" aria-label={t.collected}>
      <div className="achievement-cover-top"><div><p>{t.collectionTitle}</p><strong>{awards.size.toLocaleString(locale)}<span>{t.collected}</span></strong></div><div className="achievement-cover-art" aria-hidden="true">{featured.length ? featured.map(badge => <BadgeArt key={growthAchievementKey(badge)} item={badge} size={68} />) : <BadgeArt item={{ type: 'regional_medal', code: initialRegion, tier: 'gold' }} size={78} locked />}</div></div>
      <div className="achievement-cover-stats"><span>{t.badgeTab}<b>{districtCount}</b></span><span>{t.medalTab}<b>{medalCount}</b></span><span>{t.collectedRegions}<b>{collectionRegions}<small> / 16</small></b></span></div>
      {!awards.size && <p className="achievement-first-note">{t.emptyCollection}</p>}
    </section>

    <div className="achievement-tabs" role="group" aria-label={t.total}>
      <button type="button" aria-pressed={tab === 'district'} onClick={() => { setTab('district'); resetView() }}>{t.badgeTab}<span>{districtCount}</span></button>
      <button type="button" aria-pressed={tab === 'regional_medal'} onClick={() => { setTab('regional_medal'); resetView() }}>{t.medalTab}<span>{medalCount}</span></button>
    </div>

    <div className="achievement-region-picker"><label htmlFor="achievement-region">{t.region}</label><select id="achievement-region" value={regionCode} onChange={event => { setRegionCode(event.target.value); resetView() }}><option value="all">{t.allRegions}</option>{growthAchievementRegions.map(item => <option key={item.code} value={item.code}>{growthAchievementName(item, locale)}</option>)}</select><span>{t.earned} <b>{ownedHere}</b></span></div>

    {region && record && <div className="achievement-region-status"><div><span>{t.regionCollection}</span><strong>{record.earnedDistricts} <small>/ {record.targetDistricts}</small></strong></div><div className="achievement-meter" role="progressbar" aria-label={t.regionCollection} aria-valuemin={0} aria-valuemax={Math.max(1, record.targetDistricts)} aria-valuenow={Math.min(record.targetDistricts, record.earnedDistricts)}><i style={{ width: `${record.targetDistricts ? Math.min(100, record.earnedDistricts / record.targetDistricts * 100) : 0}%` }} /></div></div>}

    {region && next && <button type="button" className="achievement-next" onClick={() => setSelected({ type: 'regional_medal', code: region.code, regionCode: region.code, tier: next.tier, name: t[next.tier] })}>
      <BadgeArt item={{ type: 'regional_medal', code: region.code, tier: next.tier }} size={44} /><span><small>{t.nextGoal}</small><strong>{growthAchievementName(region, locale)} · {t[next.tier]}</strong><em>{t.facilities} {next.facilities.count}/{next.facilities.required} · {t.districts} {next.districts.count}/{next.districts.required}</em></span><Mark kind="chevron" />
    </button>}

    <div className="achievement-filter-row"><div role="group" aria-label={t.earnedOnly}>{(['all', 'earned', 'locked'] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setLimit(30) }}>{t[value]}</button>)}</div><span aria-live="polite">{matching.length}</span></div>

    <div className="achievement-sticker-book" aria-label={tab === 'district' ? t.badgeTab : t.medalTab}>
      {visible.length ? <div className="achievement-grid">{visible.map(item => {
        const key = growthAchievementKey(item), earned = awards.has(key)
        return <button type="button" key={key} className={`achievement-sticker ${earned ? 'is-earned' : 'is-locked'}`} aria-label={`${item.name} · ${earned ? t.earned : t.locked}`} onClick={() => setSelected(item)}>
          <span className="achievement-sticker-art"><BadgeArt item={item} size={72} locked={!earned} /><span className="achievement-sticker-status"><Mark kind={earned ? 'check' : 'lock'} /></span></span><strong>{item.name}</strong><span>{earned ? t.earned : t.locked}</span>
        </button>
      })}</div> : <p className="achievement-empty">{t.emptyFilter}</p>}
      {matching.length > limit && <button type="button" className="achievement-more" onClick={() => setLimit(value => value + 30)}>{t.more} <span>{visible.length} / {matching.length}</span></button>}
    </div>
    <p className="achievement-policy-note">{t.policyNote}{regions.some(item => summary.regions.find(value => value.code === item.code)?.targetDistricts !== item.districts.length) && <> {t.policyDifference}</>}</p>
    {selected && <AchievementDetail item={selected} summary={summary} earned={awards.get(growthAchievementKey(selected))} onClose={() => setSelected(null)} />}
  </>
}

function AchievementDetail({ item, summary, earned, onClose }: { item: CollectionItem; summary: GrowthSummary; earned?: GrowthBadge; onClose: () => void }) {
  const locale = useLocale(), t = achievementText(locale)
  const dialog = useDialogFocus(true, onClose)
  const region = growthAchievementRegions.find(value => value.code === item.regionCode)
  const district = item.type === 'district' ? region?.districts.find(value => value.code === item.code) : undefined
  const regionLabel = region ? growthAchievementName(region, locale) : ''
  const progress = item.tier ? growthMedalProgress(summary.regions.find(value => value.code === item.regionCode), item.tier) : null
  const path = region ? `/regions/${urlName(regionLabel)}-${region.code}${district ? `/${urlName(growthAchievementName(district, locale))}-${district.code}` : ''}` : null
  const earnedDate = earned ? new Date(earned.earnedAt) : null
  return createPortal(<div className="achievement-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section ref={dialog} className="achievement-detail" role="dialog" aria-modal="true" aria-labelledby="achievement-detail-title" tabIndex={-1}>
    <button type="button" className="achievement-close" onClick={onClose} aria-label={t.close}><Mark kind="close" /></button>
    <div className="achievement-detail-hero"><span className={`achievement-state-pill${earned ? ' is-earned' : ''}`}><Mark kind={earned ? 'check' : 'lock'} />{earned ? t.earned : t.locked}</span><BadgeArt item={item} size={120} /><p>{regionLabel}</p><h2 id="achievement-detail-title">{item.name}</h2></div>
    {earned && <dl className="achievement-earned-facts"><div><dt>{t.earnedOn}</dt><dd>{earnedDate && Number.isFinite(earnedDate.getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(earnedDate) : '—'}</dd></div><div><dt>{t.earnedXp}</dt><dd>+{earned.xp} XP</dd></div></dl>}
    <div className="achievement-condition"><h3>{t.condition}</h3>{item.type === 'district' ? <p>{t.districtCondition}</p> : progress ? <ProgressRows progress={progress} /> : <p>{t.noProgress}</p>}<p className="achievement-condition-note">{t.reviewRule}</p></div>
    {path && <Link href={localizedPublicPath(path, locale)!} prefetch={false} className="achievement-find">{t.findToilets}<Mark kind="chevron" /></Link>}
  </section></div>, document.body)
}

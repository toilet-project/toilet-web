'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import type { AuthProfile } from '../../api/auth'
import { useLocale } from '../../i18n/context'
import { awardNoticeText } from '../../i18n/awardNoticeText'
import { growthText } from '../../i18n/growthText'
import { localizedPublicPath } from '../../i18n/routes'
import { GROWTH_ENABLED, type GrowthBadge } from '../../lib/growth'
import { growthBadgePath } from '../../lib/growthBadgeAssets'
import { growthAchievementName } from '../../lib/growthAchievements'
import { EMPTY_AWARD_NOTICES } from '../../lib/growthAwardNotices'
import { memberAwardNotices as store } from '../../lib/memberAwardNotices'
import { useGrowth } from '../../lib/useGrowth'
const mountedSubscribe = () => () => {}
const isDemonstration = () => typeof window !== 'undefined' && ['preview.geupddong.com', 'localhost', '127.0.0.1'].includes(window.location.hostname) && new URLSearchParams(window.location.search).get('awardPreview') === '1'

/** Non-modal and focus-preserving: never interrupts a review, report, or another modal. */
export function GrowthAwardNotifications({ profile }: { profile: AuthProfile }) {
  const owner = GROWTH_ENABLED && profile.status === 'ACTIVE' && !profile.consentRequired ? profile.userId : null
  const locale = useLocale(), t = awardNoticeText(locale), g = growthText(locale), router = useRouter()
  const growth = useGrowth(owner)
  const state = useSyncExternalStore(store.subscribe, () => store.get(owner), () => EMPTY_AWARD_NOTICES)
  const mounted = useSyncExternalStore(mountedSubscribe, () => true, () => false)
  const [obstructed, setObstructed] = useState(false)
  const [preview] = useState(isDemonstration), [replay, setReplay] = useState<'all' | 'district' | 'regional_medal' | null>(() => isDemonstration() ? 'all' : null)
  useEffect(() => {
    const check = () => setObstructed(Boolean(document.querySelector('[aria-modal="true"], dialog[open], .review-modal-backdrop, .report-modal-backdrop')))
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal', 'open'] })
    return () => observer.disconnect()
  }, [])
  useEffect(() => { if (owner && growth.status === 'ready' && growth.summary) void store.load(owner) }, [owner, growth.status, growth.summary])
  const demoBadges = preview && replay ? growth.summary?.badges.filter(badge => replay === 'all' || badge.type === replay) ?? [] : []
  const demo = preview && replay !== null
  const badges = demo ? demoBadges : state.items.map(item => item.badge)
  const dismiss = async (view = false) => {
    if (demo) setReplay(null)
    else if (!owner || !await store.acknowledge(owner)) return
    if (view) {
      const mobile = window.matchMedia('(max-width: 768px)').matches
      router.push(mobile ? `${localizedPublicPath('/', locale)!}?tab=account&view=achievements` : `${localizedPublicPath('/account', locale)!}?view=achievements`)
    }
  }
  const description = (badge: GrowthBadge) => `${growthAchievementName(badge, locale)} · ${badge.type === 'district' ? g.district : g[badge.tier || 'bronze']}`
  if (!mounted || !owner) return null
  return createPortal(<>
    {preview && <aside className="award-preview-controls" aria-label={t.demo}><small>{t.demo}</small><div><button type="button" onClick={() => setReplay('district')} disabled={!growth.summary?.badges.some(badge => badge.type === 'district')}>{g.district}</button><button type="button" onClick={() => setReplay('regional_medal')} disabled={!growth.summary?.badges.some(badge => badge.type === 'regional_medal')}>{g.regions}</button><button type="button" onClick={() => setReplay('all')} disabled={!growth.summary?.badges.length}>{t.replay}</button></div>{growth.summary && !growth.summary.badges.length && <p>{t.empty}</p>}</aside>}
    {badges.length > 0 && !obstructed && <section className="award-notice" aria-label={t.title} aria-live="polite" aria-atomic="true" data-award-demo={demo || undefined}>
      <button className="award-notice-close" type="button" aria-label={t.close} disabled={!demo && state.saving} onClick={() => { void dismiss() }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button>
      <div className={`award-notice-art${badges.length > 1 ? ' is-multiple' : ''}`} aria-hidden="true"><i className="award-spark s1" /><i className="award-spark s2" /><i className="award-spark s3" />{badges.slice(0, 3).map((badge, index) => <span key={`${badge.type}:${badge.code}:${badge.tier}`} style={{ '--award-index': index } as React.CSSProperties}>{growthBadgePath(badge, 80) ? <img src={growthBadgePath(badge, 80)!} width={80} height={80} alt="" /> : <b>✦</b>}</span>)}{badges.length > 3 && <em>+{badges.length - 3}</em>}</div>
      {demo && <p className="award-notice-demo">{t.demo}</p>}
      <p className="award-notice-eyebrow">{badges.length > 1 ? t.multiple.replace('{count}', badges.length.toLocaleString(locale)) : t.single}</p>
      <h2>{t.title}</h2>
      <ul className="award-notice-earned">{badges.map(badge => <li key={`${badge.type}:${badge.code}:${badge.tier}`}><span>{description(badge)}</span><small>+{badge.xp.toLocaleString(locale)} XP</small></li>)}</ul>
      {!demo && state.error && <p className="award-notice-error" role="alert">{t.error}</p>}
      <button className="award-notice-view" type="button" disabled={!demo && state.saving} onClick={() => { void dismiss(true) }}>{t.view}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg></button>
    </section>}
  </>, document.body)
}

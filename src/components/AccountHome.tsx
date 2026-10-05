'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { AuthProfile } from '../api/auth'
import { useLocale } from '../i18n/context'
import { growthText } from '../i18n/growthText'
import { achievementText } from '../i18n/achievementText'
import { experienceHistoryText } from '../i18n/experienceHistoryText'
import { localizedPublicPath } from '../i18n/routes'
import { GROWTH_ENABLED, growthRanks } from '../lib/growth'
import { growthEarnedAchievements, growthHighestRegionalAwards } from '../lib/growthAchievements'
import { growthBadgePath } from '../lib/growthBadgeAssets'
import { useGrowth } from '../lib/useGrowth'
import { OwnPhoto } from './ProfilePhoto'
import { AccountProfileEditor } from './AccountProfileEditor'
import { RankIcon } from './growth/RankIcon'
import { GrowthStatus } from './growth/GrowthStatus'

export function AccountHome({ profile, onProfile, onExpired }: { profile: AuthProfile; onProfile: (profile: AuthProfile) => void; onExpired: () => void }) {
  const locale = useLocale(), t = growthText(locale), state = useGrowth(profile.status === 'ACTIVE' && !profile.consentRequired ? profile.userId : null)
  const [editing, setEditing] = useState(false)
  const summary = state.summary, rank = summary ? growthRanks.find(item => item.key === summary.rank)! : null
  const achievements = achievementText(locale), history = experienceHistoryText(locale)
  const accountPath = localizedPublicPath('/account', locale)!
  const growthAvailable = GROWTH_ENABLED && profile.status === 'ACTIVE' && !profile.consentRequired
  const collection = summary ? [...growthHighestRegionalAwards(summary).values(), ...[...growthEarnedAchievements(summary).values()].filter(badge => badge.type === 'district')] : []
  const number = (value: number) => value.toLocaleString(locale)
  return <div className="account-home"><header className="account-home-heading"><h1>{t.home}</h1><p>{t.homeIntro}</p></header>
    <section className="account-home-card" aria-label={t.profile} style={rank ? { '--growth-color': rank.color, '--growth-bar': rank.bar } as React.CSSProperties : undefined}>
      <div className="account-home-top"><button className="account-home-avatar" type="button" onClick={() => setEditing(true)} aria-label={t.editProfile}><OwnPhoto state={profile.profilePhoto ?? null} fallback={<span>{(profile.displayName || 'G')[0]}</span>} /></button><div className="account-home-copy"><p>{t.profile}</p><div className="account-home-name">{summary && <><RankIcon rank={summary.rank} size={32} /><span>Lv.{summary.level}</span></>}<h2>{profile.displayName || t.home}</h2></div>{summary && <small>{t.ranks[growthRanks.findIndex(item => item.key === summary.rank)]}</small>}</div><button className="account-home-edit" type="button" onClick={() => setEditing(true)}>{t.editProfile}</button></div>
      {summary && <div className="account-home-growth"><div><div className="account-home-progress-heading"><span>{t.nextLevel} <b>Lv.{summary.nextLevel}</b></span><strong>{number(summary.remainingXp)} <small>XP</small></strong></div><div className="account-home-progress-track"><div role="progressbar" aria-label={t.nextLevel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.progressPercent} style={{ width: `${summary.progressPercent}%` }} /></div><p className="account-home-progress-caption">{t.progress}<span>{Math.round(summary.progressPercent)}%</span></p></div><div className="account-home-total"><span>{t.totalXp}</span><strong>{number(summary.totalXp)} <small>XP</small></strong></div></div>}
      <GrowthStatus state={state} retry={state.refresh} />
      <div className={`account-home-guides${growthAvailable ? ' has-history' : ''}`}><Link href={localizedPublicPath('/growth/ranks', locale)!}><span><strong>{t.rankGuide}</strong><small>{t.nextRank}</small></span><i aria-hidden="true">↗</i></Link><Link href={localizedPublicPath('/growth/levels', locale)!}><span><strong>{t.levelGuide}</strong><small>{t.earnGuide}</small></span><i aria-hidden="true">↗</i></Link>{growthAvailable && <Link href={`${accountPath}?view=experience`}><span><strong>{history.title}</strong><small>{history.earned} · {history.deducted}</small></span><i aria-hidden="true">↗</i></Link>}</div>
    </section><p className="account-home-message">{t.growthMessage}</p>
    {summary && <section className="account-home-collection" aria-labelledby="account-collection-title"><div className="account-home-collection-heading"><h2 id="account-collection-title">{t.collection}<span>{collection.length}</span></h2>{growthAvailable && <Link href={`${accountPath}?view=achievements`}>{achievements.title}<span aria-hidden="true">↗</span></Link>}</div>{collection.length ? <ul>{collection.slice(0, 6).map(badge => { const asset = growthBadgePath(badge); return <li key={`${badge.type}:${badge.code}:${badge.tier}`}>{asset ? <img className="account-earned-badge" src={asset} width={56} height={56} alt="" loading="lazy" /> : <span className={`account-earned-medal ${badge.tier || 'district'}`} aria-hidden="true">✓</span>}<span>{badge.name}<small>{badge.type === 'district' ? t.district : t[badge.tier || 'bronze']}</small></span></li> })}</ul> : <p>{t.emptyBadges}</p>}
      {summary.regions.some(region => region.earnedDistricts || region.distinctFacilities) && <div className="account-region-records"><h3>{t.regions}</h3>{summary.regions.filter(region => region.earnedDistricts || region.distinctFacilities).map(region => <p key={region.code}><strong>{region.name}</strong><span>{t.districts} {region.earnedDistricts}/{region.targetDistricts} · {region.distinctFacilities} {t.facilities}</span></p>)}</div>}
    </section>}
    {editing && <AccountProfileEditor profile={profile} onProfile={onProfile} onClose={() => setEditing(false)} onExpired={onExpired} />}
  </div>
}

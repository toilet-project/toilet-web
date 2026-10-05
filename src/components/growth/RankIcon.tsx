'use client'
import { useEffect, useState } from 'react'
import { useLocale } from '../../i18n/context'
import { growthText } from '../../i18n/growthText'
import { growthIconPath, growthRanks, type GrowthRank } from '../../lib/growth'
export function RankIcon({ rank, size = 24, decorative = false }: { rank: GrowthRank; size?: number; decorative?: boolean }) {
  const [reduced, setReduced] = useState(true)
  const t = growthText(useLocale())
  useEffect(() => { const media = window.matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setReduced(media.matches); update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update) }, [])
  return <img className="growth-rank-icon" src={growthIconPath(rank, size, reduced)} width={size} height={size} alt={decorative ? '' : t.ranks[growthRanks.findIndex(item => item.key === rank)]} />
}

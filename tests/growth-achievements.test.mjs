import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'
import provinces from '../data/regions/sido.json' with { type: 'json' }
import districts from '../data/regions/sgg.json' with { type: 'json' }
import { growthBadgePath } from '../src/lib/growthBadgeAssets.ts'
import {
  growthAchievementDistricts, growthAchievementRegions, growthAchievementName,
  growthMedalTiers, growthAchievementKey, growthEarnedAchievements, growthHighestRegionalAwards,
  growthMedalProgress, growthNextMedalProgress,
} from '../src/lib/growthAchievements.ts'

const region = (patch = {}) => ({ code: '11', name: '서울특별시', targetDistricts: 25,
  earnedDistricts: 3, distinctFacilities: 8, tier: 'bronze',
  bronzeFacilities: 3, silverFacilities: 10, goldFacilities: 30,
  silverDistricts: 13, goldDistricts: 25, ...patch })

test('the lightweight achievement catalogue matches current canonical codes, names, and approved artwork', () => {
  assert.equal(growthAchievementRegions.length, 16)
  assert.equal(growthAchievementDistricts.length, 256)
  assert.equal(new Set(growthAchievementDistricts.map(item => item.code)).size, 256)
  assert.deepEqual(growthAchievementRegions.map(({ code, name }) => ({ code, name })), provinces.features.map(({ properties: p }) => ({ code: p.sido, name: p.sidonm })))
  assert.deepEqual(growthAchievementDistricts, districts.features.map(({ properties: p }) => ({
    code: p.sgg, name: p.sggnm.replace(/^(.+?시)(.+구)$/u, '$1 $2'), regionCode: p.sido,
  })))
  for (const province of growthAchievementRegions) {
    assert.deepEqual(province.districts, growthAchievementDistricts.filter(item => item.regionCode === province.code))
    for (const tier of growthMedalTiers) {
      const path = growthBadgePath({ type: 'regional_medal', code: province.code, tier })
      assert.ok(path && existsSync(new URL(`../public${path}`, import.meta.url)))
    }
  }
  for (const district of growthAchievementDistricts) {
    const path = growthBadgePath({ type: 'district', code: district.code, tier: null })
    assert.ok(path && existsSync(new URL(`../public${path}`, import.meta.url)))
  }
})

test('achievement names use the existing translations and preserve unknown names', () => {
  const seoul = growthAchievementRegions.find(item => item.code === '11')
  const jongno = growthAchievementDistricts.find(item => item.code === '11110')
  assert.equal(growthAchievementName(seoul, 'ko'), '서울특별시')
  assert.equal(growthAchievementName(seoul, 'en'), 'Seoul')
  assert.equal(growthAchievementName(seoul, 'zh-TW'), '首爾')
  assert.equal(growthAchievementName(jongno, 'en'), 'Jongno-gu')
  assert.equal(growthAchievementName({ code: 'unknown', name: '새 동네' }, 'ja'), '새 동네')
})

test('ownership requires exact server award evidence even when counts meet every medal threshold', () => {
  const district = { type: 'district', code: '11110', name: '종로구', tier: null, xp: 20, earnedAt: '2026-10-04T10:00:00' }
  const bronze = { type: 'regional_medal', code: '11', name: '서울', tier: 'bronze', xp: 30, earnedAt: '2026-10-04T10:00:00' }
  const summary = { badges: [district, bronze], regions: [region({ earnedDistricts: 25, distinctFacilities: 30 })] }
  const earned = growthEarnedAchievements(summary)
  assert.equal(earned.size, 2)
  assert.equal(earned.get(growthAchievementKey(district)), district)
  assert.equal(earned.get(growthAchievementKey(bronze)), bronze)
  assert.equal(earned.has(growthAchievementKey({ ...bronze, tier: 'silver' })), false)
  assert.equal(growthNextMedalProgress(summary.regions[0]).percent, 100)
  assert.equal(summary.badges.length, 2)
})

test('regional collection counts one region and chooses its highest actual award regardless of order', () => {
  const awards = growthMedalTiers.map(tier => ({ type: 'regional_medal', code: '11', name: '서울', tier, xp: 30, earnedAt: '2026-10-04T10:00:00' }))
  for (const badges of [awards, awards.toReversed(), [awards[1], awards[2], awards[0]]]) {
    const highest = growthHighestRegionalAwards({ badges, regions: [] })
    assert.equal(highest.size, 1)
    assert.equal(highest.get('11'), awards[2])
    assert.equal(badges.length, 3)
  }
  assert.equal(growthHighestRegionalAwards({ badges: awards.slice(0, 2), regions: [] }).get('11'), awards[1])
  assert.equal(growthHighestRegionalAwards({ badges: awards.slice(0, 1), regions: [] }).get('11'), awards[0])
})

test('regional representatives never infer ownership or higher medals from summary progress', () => {
  const regions = [region({ tier: 'gold', earnedDistricts: 25, distinctFacilities: 30 })]
  const bronze = { type: 'regional_medal', code: '11', name: '서울', tier: 'bronze', xp: 30, earnedAt: '2026-10-04T10:00:00' }
  const noTier = { ...bronze, tier: null }
  const district = { ...bronze, type: 'district', code: '11110', tier: null }
  assert.equal(growthHighestRegionalAwards({ badges: [], regions }).size, 0)
  assert.equal(growthHighestRegionalAwards({ badges: [noTier, district], regions }).size, 0)
  assert.equal(growthHighestRegionalAwards({ badges: [bronze, noTier, district], regions }).get('11'), bronze)
})

test('regional collection preserves historical and unknown codes absent from current region progress', () => {
  const historical = { type: 'regional_medal', code: '29', name: '광주광역시', tier: 'silver', xp: 50, earnedAt: '2026-09-01T10:00:00' }
  const unknown = { ...historical, code: 'new-region', name: '새 지역', tier: 'bronze' }
  const current = { ...historical, code: '11', name: '서울특별시', tier: 'gold' }
  const highest = growthHighestRegionalAwards({ badges: [historical, unknown, current], regions: [region()] })
  assert.equal(highest.size, 3)
  assert.equal(highest.get('29'), historical)
  assert.equal(highest.get('new-region'), unknown)
  assert.equal(highest.get('11'), current)
})

test('the next medal requires both server-reported facility and district thresholds', () => {
  const progress = growthNextMedalProgress(region({ silverFacilities: 12, silverDistricts: 6 }))
  assert.deepEqual(progress, {
    tier: 'silver', facilities: { count: 8, required: 12, remaining: 4 },
    districts: { count: 3, required: 6, remaining: 3 }, percent: 50,
  })
  const facilitiesLimit = growthMedalProgress(region({ distinctFacilities: 5, earnedDistricts: 25 }), 'silver')
  assert.equal(facilitiesLimit.percent, 50)
  assert.equal(facilitiesLimit.districts.count, 25)
  assert.equal(facilitiesLimit.districts.remaining, 0)
  assert.equal(growthMedalProgress(region({ earnedDistricts: 0, distinctFacilities: 30 }), 'bronze').percent, 0)
  assert.equal(growthNextMedalProgress(region({ tier: null })).tier, 'bronze')
  assert.equal(growthNextMedalProgress(region({ tier: 'silver' })).tier, 'gold')
})

test('missing policy data and a completed top tier do not invent progress or further rewards', () => {
  assert.equal(growthMedalProgress(undefined, 'bronze'), null)
  assert.equal(growthNextMedalProgress(null), null)
  assert.equal(growthNextMedalProgress(region({ tier: 'gold' })), null)
  assert.equal(growthNextMedalProgress(region({ targetDistricts: 0 })), null)
  assert.equal(growthMedalProgress(region({ goldFacilities: 0 }), 'gold'), null)
  assert.equal(growthMedalProgress(region({ goldDistricts: 0 }), 'gold'), null)
})

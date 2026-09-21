import test from 'node:test'
import assert from 'node:assert/strict'
import { groupToiletsByCoordinate, representativeToilet, coordinateGroupCategory } from '../src/lib/toiletGrouping.ts'

test('single open toilet retains category through list grouping and selection', () => {
  const toilet = { id: 13448, name: '테스트', toiletType: '개방화장실', latitude: 36.4, longitude: 127.3 }
  const [group] = groupToiletsByCoordinate([toilet])
  assert.equal(group.count, 1)
  assert.deepEqual(representativeToilet(group), toilet)
})

test('same-coordinate group retains first representative and its category without mutating data', () => {
  const toilets = [
    { id: 1, name: 'A', toiletType: '공중화장실', latitude: 36.4, longitude: 127.3 },
    { id: 2, name: 'B', toiletType: '개방화장실', latitude: 36.4, longitude: 127.3 },
  ]
  const original = structuredClone(toilets)
  const [group] = groupToiletsByCoordinate(toilets)
  assert.equal(group.count, 2)
  assert.deepEqual(representativeToilet(group), toilets[0])
  assert.deepEqual(toilets, original)
})

test('absent category stays absent instead of inventing a source category', () => {
  const [group] = groupToiletsByCoordinate([{ id: 3, name: 'C', latitude: 36, longitude: 127 }])
  assert.equal(representativeToilet(group).toiletType, undefined)
  assert.deepEqual(groupToiletsByCoordinate([]), [])
})

test('group header keeps source categories, independently of the administrator badge', () => {
  const toilets = [{ toiletType: '개방화장실', displayGroupName: '문화원' }, { toiletType: '개방화장실' }]
  assert.equal(coordinateGroupCategory(toilets), '개방화장실')
  assert.equal(coordinateGroupCategory([...toilets, { toiletType: '공중화장실' }]), '개방화장실 · 공중화장실')
  assert.equal(coordinateGroupCategory([{ toiletType: '' }]), '화장실')
})

test('administrator display group replaces the generic same-coordinate label', () => {
  const [group] = groupToiletsByCoordinate([
    { id: 11, name: 'XXX문화원 1층', latitude: 36.4, longitude: 127.3, displayGroupId: 8, displayGroupName: 'XXX문화원' },
    { id: 12, name: 'XXX문화원 2층', latitude: 36.4, longitude: 127.3, displayGroupId: 8, displayGroupName: 'XXX문화원' },
    { id: 13, name: 'XXX문화원 3층', latitude: 36.4, longitude: 127.3, displayGroupId: 8, displayGroupName: 'XXX문화원' },
  ])
  assert.equal(group.displayGroupName, 'XXX문화원')
  assert.equal(group.count, 3)
  assert.equal(group.toilets.length, 3)
})

test('administrator display group label accounts for ungrouped toilets at the same coordinate', () => {
  const [group] = groupToiletsByCoordinate([
    { id: 21, name: 'XXX문화원 1층', latitude: 36.4, longitude: 127.3, displayGroupId: 9, displayGroupName: 'XXX문화원' },
    { id: 22, name: 'XXX문화원 2층', latitude: 36.4, longitude: 127.3, displayGroupId: 9, displayGroupName: 'XXX문화원' },
    { id: 23, name: '인근 공원 화장실', latitude: 36.4, longitude: 127.3 },
  ])
  assert.equal(group.displayGroupName, 'XXX문화원 외 1개 장소')
})

test('administrator display group summary follows the active locale', () => {
  const [group] = groupToiletsByCoordinate([
    { id: 31, name: 'Center 1F', latitude: 36.4, longitude: 127.3, displayGroupId: 10, displayGroupName: 'XXX Cultural Center' },
    { id: 32, name: 'Center 2F', latitude: 36.4, longitude: 127.3, displayGroupId: 10, displayGroupName: 'XXX Cultural Center' },
    { id: 33, name: 'Library', latitude: 36.4, longitude: 127.3 },
  ], 'en')
  assert.equal(group.displayGroupName, 'XXX Cultural Center and 1 more place')
})

test('additional grouped places use the selected Japanese or Chinese UI language', () => {
  const facilities = [
    { id: 41, name: '첫 번째', latitude: 36.4, longitude: 127.3, displayGroupId: 10, displayGroupName: '문화원' },
    { id: 42, name: '두 번째', latitude: 36.4, longitude: 127.3 },
  ]
  for (const [locale, suffix] of [['ja', 'ほか1か所'], ['zh-CN', '另有1处地点'], ['zh-TW', '另有1處地點'], ['zh-HK', '另有1個地點']]) {
    assert.equal(groupToiletsByCoordinate(facilities, locale)[0].displayGroupName, `문화원 ${suffix}`)
  }
})

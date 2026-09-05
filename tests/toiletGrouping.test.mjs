import test from 'node:test'
import assert from 'node:assert/strict'
import { groupToiletsByCoordinate, representativeToilet } from '../src/lib/toiletGrouping.ts'

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

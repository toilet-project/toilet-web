import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_MAP_FILTER_ORDER, MAP_FILTER_ORDER_KEY, normalizeMapFilterOrder, promoteMapFilter,
  readMapFilterOrder, writeMapFilterOrder, setMapFilter, setAccessibleGender } from '../src/lib/mapFilterPreferences.ts'
import { matchesMapFilters } from '../src/lib/mapFilters.ts'
import { mapFilterCopy } from '../src/i18n/mapFilterCopy.ts'

test('gender selection enables parent, both is AND, deselecting parent clears children', () => {
  const male = setAccessibleGender(2, 'male', true)
  const both = setAccessibleGender(male, 'female', true)
  assert.equal(male, 50)
  assert.equal(both, 114)
  assert.equal(matchesMapFilters(50, both), false)
  assert.equal(matchesMapFilters(82, both), false)
  assert.equal(matchesMapFilters(114, both), true)
  assert.equal(setAccessibleGender(both, 'male', false), 82)
  assert.equal(setAccessibleGender(82, 'female', false), 18)
  assert.equal(setMapFilter(both, 'accessible', false), 2)
  assert.equal(setMapFilter(2, 'accessible', true), 18)
  assert.equal(setMapFilter(both, 'cctv', false), 112)
})

test('promoted order round-trips through browser storage without persisting selected filters', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  assert.deepEqual(readMapFilterOrder(storage), DEFAULT_MAP_FILTER_ORDER)
  const first = promoteMapFilter([...DEFAULT_MAP_FILTER_ORDER], 'cctv')
  const second = promoteMapFilter(first, 'accessible')
  assert.deepEqual(second, ['accessible', 'cctv', 'mine', 'hours', 'diaper', 'bell'])
  writeMapFilterOrder(storage, second)
  assert.deepEqual(readMapFilterOrder(storage), second)
  assert.deepEqual([...values.keys()], [MAP_FILTER_ORDER_KEY])
  assert.deepEqual(promoteMapFilter(second, 'accessible'), second)
})

test('stale, corrupt or denied browser storage never breaks filtering or drops a button', () => {
  assert.deepEqual(normalizeMapFilterOrder(['bell', 'bell', 'unknown', 123, {}, null]),
    ['bell', 'mine', 'hours', 'cctv', 'diaper', 'accessible'])
  for (const raw of ['{broken', 'null', '{}', 'true'])
    assert.deepEqual(readMapFilterOrder({ getItem: () => raw }), DEFAULT_MAP_FILTER_ORDER)
  const blocked = { getItem() { throw Error('blocked') }, setItem() { throw Error('quota') } }
  assert.deepEqual(readMapFilterOrder(blocked), DEFAULT_MAP_FILTER_ORDER)
  assert.doesNotThrow(() => writeMapFilterOrder(blocked, ['accessible']))
})

test('all supported languages label actionable dropdown controls', () => {
  for (const copy of Object.values(mapFilterCopy)) {
    for (const key of ['male', 'female', 'clearAll', 'accessible']) assert.ok(copy[key]?.trim())
    assert.notEqual(copy.male, copy.female)
  }
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_MAP_FILTER_ORDER, MAP_FILTER_SELECTION_KEY, normalizeMapFilterSelection,
  readMapFilterSelection, writeMapFilterSelection, resolveMapFilterOwner, appendSelectedMapFilter, orderMapFilters,
  setMapFilter, setAccessibleGender } from '../src/lib/mapFilterPreferences.ts'
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

test('map filters start in the requested default order', () => {
  assert.deepEqual(DEFAULT_MAP_FILTER_ORDER, ['hours', 'mine', 'bell', 'cctv', 'accessible', 'diaper'])
  assert.deepEqual(orderMapFilters(DEFAULT_MAP_FILTER_ORDER, { flags: 0, mine: false }), DEFAULT_MAP_FILTER_ORDER)
})

test('selected chips keep their priority while every unselected chip returns to default relative order', () => {
  const priority = Object.freeze(['diaper', 'cctv', 'mine', 'bell', 'hours', 'accessible'])
  const selection = Object.freeze({ flags: 18, mine: true })
  const displayed = orderMapFilters(priority, selection)
  assert.deepEqual(displayed, ['cctv', 'mine', 'accessible', 'hours', 'bell', 'diaper'])
  assert.equal(displayed.length, DEFAULT_MAP_FILTER_ORDER.length)
  assert.equal(new Set(displayed).size, DEFAULT_MAP_FILTER_ORDER.length)
  assert.deepEqual(priority, ['diaper', 'cctv', 'mine', 'bell', 'hours', 'accessible'])
  assert.deepEqual(selection, { flags: 18, mine: true })
  assert.deepEqual(orderMapFilters(priority, { flags: 31, mine: true }), priority)
})

test('adding a chip restores the unselected default order even after previous deselections', () => {
  const priority = ['diaper', 'accessible', 'cctv', 'bell', 'mine', 'hours']
  const selection = { flags: 2, mine: true }
  assert.deepEqual(appendSelectedMapFilter(priority, 'hours', selection),
    ['cctv', 'mine', 'hours', 'bell', 'accessible', 'diaper'])
  assert.deepEqual(appendSelectedMapFilter(priority, 'cctv', selection),
    ['cctv', 'mine', 'hours', 'bell', 'accessible', 'diaper'])
})

test('new selections follow the existing selected chips without duplicates or input mutation', () => {
  const initial = Object.freeze([...DEFAULT_MAP_FILTER_ORDER])
  const first = appendSelectedMapFilter(initial, 'cctv', { flags: 0, mine: false })
  assert.deepEqual(first, ['cctv', 'hours', 'mine', 'bell', 'accessible', 'diaper'])
  const previousSelection = Object.freeze({ flags: 2, mine: false })
  const second = appendSelectedMapFilter(Object.freeze(first), 'accessible', previousSelection)
  assert.deepEqual(second, ['cctv', 'accessible', 'hours', 'mine', 'bell', 'diaper'])
  const unchanged = appendSelectedMapFilter(second, 'accessible', { flags: 18, mine: false })
  assert.deepEqual(unchanged, second)
  assert.notEqual(unchanged, second)
  assert.equal(second.length, DEFAULT_MAP_FILTER_ORDER.length)
  assert.equal(new Set(second).size, DEFAULT_MAP_FILTER_ORDER.length)
  assert.deepEqual(previousSelection, { flags: 2, mine: false })
  assert.deepEqual(first, ['cctv', 'hours', 'mine', 'bell', 'accessible', 'diaper'])
  assert.deepEqual(initial, DEFAULT_MAP_FILTER_ORDER)
  assert.deepEqual(DEFAULT_MAP_FILTER_ORDER, ['hours', 'mine', 'bell', 'cctv', 'accessible', 'diaper'])
})

test('mine joins the selected tail and remains ahead of later selections', () => {
  const first = appendSelectedMapFilter(DEFAULT_MAP_FILTER_ORDER, 'cctv', { flags: 0, mine: false })
  const withMine = appendSelectedMapFilter(first, 'mine', { flags: 2, mine: false })
  assert.deepEqual(withMine, ['cctv', 'mine', 'hours', 'bell', 'accessible', 'diaper'])
  assert.deepEqual(appendSelectedMapFilter(withMine, 'diaper', { flags: 2, mine: true }),
    ['cctv', 'mine', 'diaper', 'hours', 'bell', 'accessible'])
  const sameMine = appendSelectedMapFilter(withMine, 'mine', { flags: 2, mine: true })
  assert.deepEqual(sameMine, withMine)
  assert.notEqual(sameMine, withMine)
})

test('restored noncontiguous selections retain their visible relative order ahead of a new chip', () => {
  assert.deepEqual(appendSelectedMapFilter(DEFAULT_MAP_FILTER_ORDER, 'bell', { flags: 7, mine: true }),
    ['hours', 'mine', 'cctv', 'diaper', 'bell', 'accessible'])
  assert.deepEqual(appendSelectedMapFilter(DEFAULT_MAP_FILTER_ORDER, 'hours', { flags: 16, mine: true }),
    ['mine', 'accessible', 'hours', 'bell', 'cctv', 'diaper'])
})

test('deselecting a leading chip brings remaining selections forward and reselecting appends to their tail', () => {
  const first = appendSelectedMapFilter(DEFAULT_MAP_FILTER_ORDER, 'bell', { flags: 0, mine: false })
  const second = appendSelectedMapFilter(first, 'cctv', { flags: 8, mine: false })
  const order = appendSelectedMapFilter(second, 'mine', { flags: 10, mine: false })
  const flagsAfterDeselection = setMapFilter(10, 'bell', false)
  assert.equal(flagsAfterDeselection, 2)
  assert.deepEqual(order, ['bell', 'cctv', 'mine', 'hours', 'accessible', 'diaper'])
  const afterDeselection = orderMapFilters(order, { flags: flagsAfterDeselection, mine: true })
  assert.deepEqual(afterDeselection, ['cctv', 'mine', 'hours', 'bell', 'accessible', 'diaper'])
  assert.deepEqual(appendSelectedMapFilter(afterDeselection, 'bell', { flags: flagsAfterDeselection, mine: true }),
    ['cctv', 'mine', 'bell', 'hours', 'accessible', 'diaper'])
})

test('turning mine off moves it back among unselected defaults while public selections stay ahead', () => {
  const priority = ['mine', 'diaper', 'cctv', 'hours', 'bell', 'accessible']
  assert.deepEqual(orderMapFilters(priority, { flags: 6, mine: false }),
    ['diaper', 'cctv', 'hours', 'mine', 'bell', 'accessible'])
})

test('clear-all restores the complete default order regardless of prior selection priority', () => {
  const priority = ['diaper', 'accessible', 'cctv', 'mine', 'bell', 'hours']
  const cleared = orderMapFilters(priority, { flags: 0, mine: false })
  assert.deepEqual(cleared, DEFAULT_MAP_FILTER_ORDER)
  assert.deepEqual(appendSelectedMapFilter(cleared, 'bell', { flags: 0, mine: false }),
    ['bell', 'hours', 'mine', 'cctv', 'accessible', 'diaper'])
})

test('adding an accessibility gender does not move its already selected parent again', () => {
  const first = appendSelectedMapFilter(DEFAULT_MAP_FILTER_ORDER, 'cctv', { flags: 0, mine: false })
  const withAccessible = appendSelectedMapFilter(first, 'accessible', { flags: 2, mine: false })
  const male = setAccessibleGender(2, 'male', true)
  const order = appendSelectedMapFilter(withAccessible, 'bell', { flags: male, mine: false })
  assert.deepEqual(order, ['cctv', 'accessible', 'bell', 'hours', 'mine', 'diaper'])
  const flagsBeforeSecondGender = setMapFilter(male, 'bell', true)
  assert.equal(setAccessibleGender(flagsBeforeSecondGender, 'female', true), 122)
  assert.deepEqual(appendSelectedMapFilter(order, 'accessible', { flags: flagsBeforeSecondGender, mine: false }), order)
  assert.deepEqual(appendSelectedMapFilter(DEFAULT_MAP_FILTER_ORDER, 'accessible', { flags: male, mine: false }),
    ['cctv', 'accessible', 'hours', 'mine', 'bell', 'diaper'])
  assert.deepEqual(orderMapFilters(order, { flags: setMapFilter(flagsBeforeSecondGender, 'accessible', false), mine: false }),
    ['cctv', 'bell', 'hours', 'mine', 'accessible', 'diaper'])
})

test('refresh restores selected chips first in default order without retaining previous selection priority', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const first = appendSelectedMapFilter(DEFAULT_MAP_FILTER_ORDER, 'diaper', { flags: 0, mine: false })
  const order = appendSelectedMapFilter(first, 'mine', { flags: 4, mine: false })
  assert.deepEqual(order, ['diaper', 'mine', 'hours', 'bell', 'cctv', 'accessible'])
  writeMapFilterSelection(storage, { flags: 4, mine: true, order })
  assert.deepEqual(readMapFilterSelection(storage), { flags: 4, mine: true })
  assert.deepEqual(JSON.parse(values.get(MAP_FILTER_SELECTION_KEY)), { flags: 4, mine: true })
  assert.deepEqual([...values.keys()], [MAP_FILTER_SELECTION_KEY])
  const restoredOrder = orderMapFilters(DEFAULT_MAP_FILTER_ORDER, readMapFilterSelection(storage))
  assert.deepEqual(restoredOrder, ['mine', 'diaper', 'hours', 'bell', 'cctv', 'accessible'])
  assert.notDeepEqual(restoredOrder, order)
  assert.deepEqual([...DEFAULT_MAP_FILTER_ORDER], ['hours', 'mine', 'bell', 'cctv', 'accessible', 'diaper'])
})

test('selected filters round-trip through browser storage and clear-all remains cleared', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  assert.equal(MAP_FILTER_SELECTION_KEY, 'geupddong:map-filter-selection:v1')
  assert.deepEqual(readMapFilterSelection(storage), { flags: 0, mine: false })
  const selected = { flags: setAccessibleGender(setMapFilter(0, 'hours', true), 'female', true), mine: true }
  writeMapFilterSelection(storage, selected)
  assert.deepEqual(readMapFilterSelection(storage), { flags: 81, mine: true })
  assert.deepEqual([...values.keys()], [MAP_FILTER_SELECTION_KEY])
  writeMapFilterSelection(storage, { flags: 0, mine: false })
  assert.deepEqual(readMapFilterSelection(storage), { flags: 0, mine: false })
})

test('selection normalization rejects invalid flag values and only accepts boolean mine', () => {
  for (const value of [undefined, null, true, '31', -1, 128, 2.5, NaN, Infinity, {}, []])
    assert.deepEqual(normalizeMapFilterSelection({ flags: value, mine: true }), { flags: 0, mine: true })
  for (const mine of [undefined, null, false, 0, 1, 'true', [], {}])
    assert.deepEqual(normalizeMapFilterSelection({ flags: 15, mine }), { flags: 15, mine: false })
  for (const value of [undefined, null, true, 127, 'mine', ['hours', 'mine']])
    assert.deepEqual(normalizeMapFilterSelection(value), { flags: 0, mine: false })
  assert.deepEqual(normalizeMapFilterSelection({ flags: 127, mine: true }), { flags: 127, mine: true })
})

test('restored accessibility gender selections always enable their parent', () => {
  for (const [flags, normalized] of [[32, 48], [64, 80], [96, 112], [97, 113], [16, 16], [0, 0]]) {
    assert.deepEqual(normalizeMapFilterSelection({ flags, mine: false }), { flags: normalized, mine: false })
    assert.deepEqual(readMapFilterSelection({ getItem: () => JSON.stringify({ flags }) }),
      { flags: normalized, mine: false })
  }
})

test('corrupt or denied browser storage never breaks filtering', () => {
  for (const raw of ['{broken', 'null', '{}', 'true', '[]', '"mine"', '{"flags":-1,"mine":"true"}'])
    assert.deepEqual(readMapFilterSelection({ getItem: () => raw }), { flags: 0, mine: false })
  const blocked = { getItem() { throw Error('blocked') }, setItem() { throw Error('quota') } }
  assert.deepEqual(readMapFilterSelection(blocked), { flags: 0, mine: false })
  assert.doesNotThrow(() => writeMapFilterSelection(blocked, { flags: 113, mine: true }))
})

test('legacy order storage cannot become a selected-filter preference', () => {
  const legacyKey = 'geupddong:map-filter-order:v1'
  const legacyOrder = JSON.stringify(['diaper', 'cctv', 'mine', 'accessible', 'bell', 'hours'])
  const values = new Map([[legacyKey, legacyOrder]])
  const reads = []
  const storage = {
    getItem: key => { reads.push(key); return values.get(key) ?? null },
    setItem: (key, value) => values.set(key, value),
  }
  assert.deepEqual(readMapFilterSelection(storage), { flags: 0, mine: false })
  assert.deepEqual(reads, [MAP_FILTER_SELECTION_KEY])
  writeMapFilterSelection(storage, { flags: 9, mine: false })
  assert.deepEqual(readMapFilterSelection(storage), { flags: 9, mine: false })
  assert.equal(values.get(legacyKey), legacyOrder)
})

test('selection storage contains only flags and mine, never account IDs, likes or order', () => {
  let serialized
  const storage = { setItem: (key, value) => { assert.equal(key, MAP_FILTER_SELECTION_KEY); serialized = value } }
  writeMapFilterSelection(storage, {
    flags: 32, mine: true, owner: 'private-account', userId: 'private-account',
    likedIds: [345, 678], ids: [345, 678], order: ['mine', 'hours'],
  })
  assert.deepEqual(JSON.parse(serialized), { flags: 48, mine: true })
  assert.doesNotMatch(serialized, /private-account|owner|userId|likedIds|345|678|order/)
})

test('restored mine waits for authentication before binding to the active account', () => {
  assert.equal(resolveMapFilterOwner(undefined, null, true), undefined)
  assert.equal(resolveMapFilterOwner(undefined, 'account-a', true), undefined)
  assert.equal(resolveMapFilterOwner(undefined, 'account-a', false), 'account-a')
  assert.equal(resolveMapFilterOwner('account-a', 'account-a', false), 'account-a')
})

test('guest or ineligible authentication clears pending mine and cannot reenable it later', () => {
  const owner = resolveMapFilterOwner(undefined, null, false)
  assert.equal(owner, null)
  assert.equal(resolveMapFilterOwner(owner, 'account-a', false), null)
  assert.equal(resolveMapFilterOwner(null, 'account-a', true), null)
})

test('logout, consent loss and account switches discard the former mine owner', () => {
  assert.equal(resolveMapFilterOwner('account-a', null, false), null)
  assert.equal(resolveMapFilterOwner('account-a', null, true), null)
  const switchedOwner = resolveMapFilterOwner('account-a', 'account-b', false)
  assert.equal(switchedOwner, null)
  assert.equal(resolveMapFilterOwner(switchedOwner, 'account-b', false), null)
  assert.equal(resolveMapFilterOwner(switchedOwner, 'account-a', false), null)
})

test('explicitly clearing a pending mine selection prevents restoration after login', () => {
  let owner = resolveMapFilterOwner(undefined, null, true)
  assert.equal(owner, undefined)
  owner = null
  assert.equal(resolveMapFilterOwner(owner, 'account-a', false), null)
})

test('all supported languages label actionable dropdown controls', () => {
  for (const copy of Object.values(mapFilterCopy)) {
    for (const key of ['male', 'female', 'clearAll', 'accessible']) assert.ok(copy[key]?.trim())
    assert.notEqual(copy.male, copy.female)
  }
})

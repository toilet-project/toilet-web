import test from 'node:test'
import assert from 'node:assert/strict'
import { createLikedListViewStore, LIKED_VIEW_KEY } from '../src/lib/likedListView.ts'

const storage = () => {
  const data = new Map([['unrelated', 'keep']])
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }
}
const nearest = view => ({ ...view, sort: 'distance', position: { latitude: 36.3, longitude: 127.3 }, scrollTop: 840, page: 2 })
test('detail round trip preserves sort, distance origin, loaded page and scroll position', () => {
  const store = createLikedListViewStore(storage)
  const view = nearest(store.read('user-a'))
  assert.equal(store.save('user-a', view), true)
  assert.deepEqual(store.read('user-a'), view)
})
test('tab reload keeps only sort: coordinates, rows and scroll never enter persistent storage', () => {
  const data = storage(), store = createLikedListViewStore(() => data)
  store.save('user-a', nearest(store.read('user-a')))
  assert.deepEqual(JSON.parse(data.getItem(LIKED_VIEW_KEY)), { owner: 'user-a', sort: 'distance' })
  const restored = createLikedListViewStore(() => data).read('user-a')
  assert.equal(restored.sort, 'distance'); assert.equal(restored.position, null); assert.equal(restored.scrollTop, 0)
})
test('a successful addition resets newest/top, but removal keeps the chosen sort and origin', () => {
  const store = createLikedListViewStore(storage), events = []
  const old = nearest(store.read('user-a')); store.save('user-a', old)
  const stop = store.subscribe(owner => events.push(owner))
  store.changed('user-a', false)
  const removed = store.read('user-a')
  assert.equal(removed.sort, 'distance'); assert.deepEqual(removed.position, old.position)
  assert.equal(removed.scrollTop, 840); assert.equal(removed.page, 0)
  store.changed('user-a', true)
  assert.equal(store.read('user-a').sort, 'newest'); assert.equal(store.read('user-a').scrollTop, 0)
  assert.equal(store.save('user-a', old), false)
  stop(); assert.deepEqual(events, ['user-a', 'user-a'])
})
test('logout, account switch and late responses do not leak or resurrect prior state', () => {
  const data = storage(), store = createLikedListViewStore(() => data)
  const old = nearest(store.read('user-a')); store.save('user-a', old)
  assert.equal(store.read('user-b').sort, 'newest'); assert.equal(store.save('user-a', old), false)
  store.clear(); store.changed('user-a', true)
  assert.equal(data.getItem(LIKED_VIEW_KEY), null); assert.equal(data.getItem('unrelated'), 'keep')
  assert.equal(store.save('user-a', old), false)
})
test('corrupt or blocked storage does not break sorting', () => {
  const broken = { getItem() { throw Error() }, setItem() { throw Error() }, removeItem() { throw Error() } }
  const store = createLikedListViewStore(() => broken)
  const old = nearest(store.read('user-a')); store.save('user-a', old)
  assert.deepEqual(store.read('user-a'), old)
  const data = storage(); data.setItem(LIKED_VIEW_KEY, '{')
  assert.equal(createLikedListViewStore(() => data).read('user-a').sort, 'newest')
})

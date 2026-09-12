import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyNotificationFeed, loadNotificationHistory } from '../src/lib/notificationHistory.ts'
import { historyRange } from '../src/lib/history.ts'
const item = (id, date = '2026-09-11') => ({ id, createdAt: `${date}T12:00:00`, read: false })
const page = (items, totalPages = 3) => ({ items, totalPages })
const all = historyRange('all', '2026-09-11'), active = () => true
test('notification history caches the first 20 but presents a ten-item window before requesting the next page', async () => {
  const calls = [], fetch = async p => { calls.push(p); return page(Array.from({length:20},(_,i)=>item(p*20+i))) }
  let feed = await loadNotificationHistory(emptyNotificationFeed(),all,10,fetch,active)
  assert.equal(feed.items.length,20); assert.deepEqual(calls,[0])
  feed = await loadNotificationHistory(feed,all,20,fetch,active); assert.deepEqual(calls,[0])
  feed = await loadNotificationHistory(feed,all,30,fetch,active); assert.equal(feed.items.length,40); assert.deepEqual(calls,[0,1])
})
test('custom date selection walks past newer pages and stops after crossing the lower bound', async () => {
  const calls = [], pages = [page([item(1)]),page([item(2,'2026-08-10')]),page([item(3,'2026-08-10'),item(4,'2026-08-09')],4)]
  const feed = await loadNotificationHistory(emptyNotificationFeed(),{period:'custom',from:'2026-08-10',to:'2026-08-10'},10,async p=>{calls.push(p);return pages[p]},active)
  assert.deepEqual(feed.items.map(i=>i.id),[2,3]);assert.equal(feed.hasMore,false);assert.deepEqual(calls,[0,1,2])
})
test('notification pagination deduplicates and preserves successful local read state', async () => {
  const feed = await loadNotificationHistory({items:[{...item(1),read:true}],nextPage:1,hasMore:true},all,10,async()=>page([item(1),item(2)],2),active)
  assert.deepEqual(feed.items.map(i=>i.id),[1,2]);assert.equal(feed.items[0].read,true);assert.equal(feed.hasMore,false)
})
test('empty pages terminate, invalid metadata fails, and cancelled owner responses cannot replace the feed', async () => {
  const original = emptyNotificationFeed()
  const empty = await loadNotificationHistory(original,all,10,async()=>page([]),active);assert.equal(empty.hasMore,false)
  await assert.rejects(loadNotificationHistory(original,all,10,async()=>({items:[]}),active))
  let alive=true
  const cancelled=await loadNotificationHistory(original,all,10,async()=>{alive=false;return page([item(1)])},()=>alive)
  assert.equal(cancelled,original)
})
test('long date scans yield after five pages and continue without a false completed state', async () => {
  let calls=0
  const range={period:'custom',from:'2026-01-01',to:'2026-01-01'}
  const fetch=async p=>{calls++;return page([item(p)],12)}
  let feed=await loadNotificationHistory(emptyNotificationFeed(),range,10,fetch,active)
  assert.equal(calls,5);assert.equal(feed.nextPage,5);assert.equal(feed.hasMore,true);assert.equal(feed.items.length,0)
  feed=await loadNotificationHistory(feed,range,20,fetch,active);assert.equal(calls,10);assert.equal(feed.nextPage,10)
})

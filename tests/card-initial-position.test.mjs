import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'

test('direct-link card positioning reruns after the async map is ready and layout changes',async()=>{
 const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8')
 assert.match(app,/if \(!isMapReady \|\| !selectedToilet \|\| !placeCardRef.current\) return/)
 assert.match(app,/\[isMapReady, isDesktop, selectedToilet, toiletDetail, isDetailLoading, detailError, positionPlaceCardAtToilet\]/)
})

test('desktop card fallback stays in map bounds without changing the mobile override',async()=>{
 const css=await readFile(new URL('../src/App.css',import.meta.url),'utf8')
 assert.ok(css.includes('.place-card { left: calc(var(--desktop-area-list-width) + 18px); width: min(360px, calc(100% - var(--desktop-area-list-width) - 36px)); }'))
 assert.match(css,/\.place-card, \.coordinate-group-card \{ left: 12px !important; top: auto !important;/)
})

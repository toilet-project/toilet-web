import assert from 'node:assert/strict'
import test from 'node:test'
import {cardPlacement} from '../src/lib/cardPlacement.ts'

test('card stays within every map edge and small/low viewport',()=>{
 for(const bounds of [{left:378,top:18,right:1422,bottom:840},{left:358,top:18,right:623,bottom:265}]) {
  const width=Math.min(360,bounds.right-bounds.left),height=Math.min(460,bounds.bottom-bounds.top)
  for(const x of [bounds.left-100,bounds.left,bounds.right,bounds.right+100]) for(const y of [bounds.top-100,bounds.top,bounds.bottom,bounds.bottom+100]) {
   const p=cardPlacement(bounds,{x,y},width,height)
   assert.ok(p.left>=bounds.left&&p.top>=bounds.top)
   assert.ok(p.left+width<=bounds.right&&p.top+height<=bounds.bottom)
  }
 }
})
test('prefers clear space above the marker without covering it',()=>{
 assert.deepEqual(cardPlacement({left:0,top:0,right:1000,bottom:800},{x:500,y:600},360,460),{left:320,top:122})
})

import test from 'node:test'
import assert from 'node:assert/strict'
import originPolicy from './mobile-test-origin.cjs'
const {mobileTestOrigin} = originPolicy
test('mobile tests accept only fixed preview and LAN origins',()=>{
  for(const value of ['https://preview.geupddong.com','http://192.168.0.4:4174']) assert.equal(mobileTestOrigin(value),value)
})
test('loopback origin requires explicit test support',()=>{
  assert.throws(()=>mobileTestOrigin('http://127.0.0.1:4174'))
  assert.equal(mobileTestOrigin('http://127.0.0.1:4174',{allowLoopback:true}),'http://127.0.0.1:4174')
})
test('mobile test origins reject substrings, credentials, paths and production',()=>{
  for(const value of ['https://geupddong.com','https://preview.geupddong.com.evil.test',
    'https://evil.test/https://preview.geupddong.com','https://preview.geupddong.com@evil.test',
    'https://user@preview.geupddong.com','https://preview.geupddong.com/path',
    'https://preview.geupddong.com?x=1','https://preview.geupddong.com#x',
    'http://preview.geupddong.com','http://192.168.0.40:4174','http://127.0.0.1:9999','',undefined]) {
    assert.throws(()=>mobileTestOrigin(value,{allowLoopback:true}),String(value))
  }
})

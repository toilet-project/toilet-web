import assert from 'node:assert/strict'
import test from 'node:test'
import { socialLoginPath } from '../src/lib/oauthReturn.ts'

test('only the exact approved preview origin uses preview OAuth return', () => {
  for(const provider of ['google','kakao']) {
    assert.equal(socialLoginPath(provider,'https://preview.geupddong.com'),`/api/v1/auth/login/${provider}?returnTo=preview`)
    for(const origin of ['https://geupddong.com','https://preview.geupddong.com.evil.example','http://preview.geupddong.com','https://evil.workers.dev']) {
      assert.equal(socialLoginPath(provider,origin),`/api/v1/auth/login/${provider}`)
    }
  }
})

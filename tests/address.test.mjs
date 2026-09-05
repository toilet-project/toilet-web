import assert from 'node:assert/strict'
import test from 'node:test'
import { getDisplayAddress } from '../src/lib/address.ts'

const road = '대전광역시 유성구 대학로 99'
const jibun = '대전광역시 유성구 궁동 220'

for (const [name, roadValue, jibunValue, expected] of [
  ['both present: show only road', road, jibun, road],
  ['road only', road, null, road],
  ['jibun only', null, jibun, jibun],
  ['empty road falls back', '', jibun, jibun],
  ['whitespace road falls back', ' \t\n\u00a0', jibun, jibun],
  ['trim display whitespace', `  ${road}  `, jibun, road],
  ['trim fallback whitespace', null, ` ${jibun} `, jibun],
  ['both missing', undefined, null, ''],
  ['both blank', ' ', '\t', ''],
]) {
  test(name, () => assert.equal(getDisplayAddress(roadValue, jibunValue), expected))
}

test('does not change the two source fields', () => {
  const original = Object.freeze({ roadAddress: ` ${road} `, jibunAddress: jibun })
  getDisplayAddress(original.roadAddress, original.jibunAddress)
  assert.deepEqual(original, { roadAddress: ` ${road} `, jibunAddress: jibun })
})

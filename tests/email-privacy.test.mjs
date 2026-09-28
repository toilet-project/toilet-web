import test from 'node:test';
import assert from 'node:assert/strict';
import { maskEmail } from '../src/lib/emailPrivacy.ts';

test('profile hints hide short addresses and reject malformed values', () => {
  for (const [input, expected] of [
    ['hello@example.test', 'he***@example.test'],
    ['ab@example.test', 'a***@example.test'],
    ['a@example.test', '***@example.test'],
    ['가나다@example.test', '가나***@example.test'],
    ['🙋가나@example.test', '🙋가***@example.test'],
    ['he***@example.test', 'he***@example.test'],
    ['bad@private@domain.test', '***'], ['bad\n@example.test', '***'],
    ['not an address', '***'], [null, null], ['', null], [123, null],
  ]) {
    assert.equal(maskEmail(input), expected);
    assert.equal(maskEmail(maskEmail(input)), expected);
  }
});

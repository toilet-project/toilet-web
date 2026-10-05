import test from 'node:test'
import assert from 'node:assert/strict'
import { mobileAccountHref, mobileReportFocus } from '../src/lib/accountNavigation.ts'

test('report notification focus survives account-to-mobile navigation in each language', () => {
  for (const home of ['/', '/en', '/ja', '/zh']) {
    const href = mobileAccountHref(home, 'reports', 8)
    assert.equal(href, `${home}?tab=account&view=reports&report=8`)
    assert.equal(mobileReportFocus(new URL(href, 'https://example.com').search), 8)
  }
})

test('ordinary account destinations do not inherit notification report focus', () => {
  for (const [view, query] of [['home', 'tab=account'], ['notifications', 'tab=notifications'], ['likes', 'tab=account&view=likes'], ['achievements', 'tab=account&view=achievements'], ['experience', 'tab=account&view=experience'], ['settings', 'tab=account&view=settings']]) {
    const href = mobileAccountHref('/', view, 8)
    assert.equal(href, `/?${query}`)
    assert.equal(mobileReportFocus(new URL(href, 'https://example.com').search), null)
  }
  assert.equal(mobileReportFocus('?tab=notifications&view=reports&report=8'), null)
})

test('invalid report IDs cannot select an unexpected report', () => {
  for (const value of ['', '0', '-1', '1.5', '8e0', '9007199254740992', '<script>', '8/9']) {
    assert.equal(mobileReportFocus(`?tab=account&view=reports&report=${encodeURIComponent(value)}`), null)
  }
  for (const id of [null, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal(mobileAccountHref('/', 'reports', id), '/?tab=account&view=reports')
})

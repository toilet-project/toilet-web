import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const source = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')

test('report and notification 401 share the profile expiration signal', () => {
  for (const file of ['api/reports.ts', 'api/notifications.ts']) assert.match(source(file), /response.status === 401\) throw new AuthExpiredError/)
  for (const file of ['components/MyReportsPanel.tsx', 'components/NotificationPanel.tsx']) {
    assert.match(source(file), /reason instanceof AuthExpiredError/)
    assert.match(source(file), /expireRef.current\(\)/)
  }
})
test('private panels remount per owner and late notification counters are guarded', () => {
  const app = source('App.tsx')
  assert.match(app, /<MyReportsPanel key=\{authProfile.userId\}/)
  assert.match(app, /<NotificationPanel key=\{authProfile.userId\}/)
  assert.match(app, /currentUserRef.current === owner/)
  assert.match(source('components/MobileNavigation.tsx'), /<MyReportsPanel key=\{profile.userId\}/)
})
test('expired session clears private details and retains only a navigation intent', () => {
  const app = source('App.tsx')
  assert.match(app, /setAuthProfile\(null\); setUnreadNotificationCount\(0\); setFocusedReportId\(null\)/)
  assert.match(app, /setReportTarget\(null\)/)
  assert.match(app, /setItem\(PENDING_INBOX_KEY, 'true'\)/)
  assert.match(app, /if \(openInbox\) \{ setIsNotificationsOpen\(true\); return \}/)
})
test('notification writes guard unmount and never silently open detail on failure', () => {
  const panel=source('components/NotificationPanel.tsx')
  assert.match(panel, /if \(!mounted.current\) return/)
  assert.match(panel, /failure\(reason, '읽음 처리하지 못했어요[^\n]+\n\s+return/)
  assert.match(panel, /disabled=\{writing\}/)
  assert.match(panel, /onClick=\{retry\}/)
})

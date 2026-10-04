export function mobileAccountHref(home: string, view: string, reportId: number | null = null) {
  const query = new URLSearchParams({ tab: view === 'notifications' ? 'notifications' : 'account' })
  if (view !== 'home' && view !== 'notifications') query.set('view', view)
  if (view === 'reports' && reportId !== null && Number.isSafeInteger(reportId) && reportId > 0) query.set('report', String(reportId))
  return `${home}?${query}`
}

export function mobileReportFocus(search: string): number | null {
  const query = new URLSearchParams(search)
  if (query.get('tab') !== 'account' || query.get('view') !== 'reports') return null
  const value = query.get('report')
  const id = value && /^\d+$/.test(value) ? Number(value) : NaN
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

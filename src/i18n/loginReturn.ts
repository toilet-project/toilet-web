import { isMapPath, localeForPath } from './routes.ts'

export const LANGUAGE_LOGIN_RETURN_KEY = 'geupddong.language-login-return.v1'
const MAX_AGE = 15 * 60_000
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Local pathname only: never persist OAuth codes, URLs, queries, coordinates or credentials. */
export function saveLanguageLoginReturn(storage: Store, path: string, now = Date.now()) {
  try {
    storage.removeItem(LANGUAGE_LOGIN_RETURN_KEY)
    if (!isMapPath(path) || localeForPath(path) === 'ko') return
    storage.setItem(LANGUAGE_LOGIN_RETURN_KEY, JSON.stringify({ path, savedAt: now }))
  } catch { /* Login works without storage. */ }
}

export function consumeLanguageLoginReturn(storage: Store, loginResult: string | null, now = Date.now()): string | null {
  if (loginResult !== 'success' && loginResult !== 'failed' && loginResult !== 'recovery') return null
  try {
    const raw = storage.getItem(LANGUAGE_LOGIN_RETURN_KEY)
    storage.removeItem(LANGUAGE_LOGIN_RETURN_KEY)
    if (!raw || raw.length > 256) return null
    const record = JSON.parse(raw)
    if (!record || typeof record.path !== 'string' || !isMapPath(record.path) || localeForPath(record.path) === 'ko'
      || !Number.isFinite(record.savedAt) || record.savedAt > now || now - record.savedAt > MAX_AGE) return null
    return record.path
  } catch { return null }
}

import { useEffect, useRef, useState } from 'react'
import { useMessages } from '../i18n/context'
import { createApiUrl } from '../config/api'
import { fetchSessionRead } from '../api/session'
import { decodePhoto, PROFILE_PHOTO_ENABLED, type PhotoState } from './profilePhoto'
export function useProfilePhoto(owner: string, onExpired: () => void, initialState?: PhotoState) {
  const t = useMessages()
  const [state, setState] = useState<PhotoState | null>(initialState ?? null)
  const [error, setError] = useState('')
  const [revision, reload] = useState(0)
  const onExpiredRef = useRef(onExpired)
  useEffect(() => { onExpiredRef.current = onExpired }, [onExpired])
  useEffect(() => {
    if (!PROFILE_PHOTO_ENABLED || initialState !== undefined) return
    let active = true
    void (async () => {
      try {
        const response = await fetchSessionRead(createApiUrl('/api/v1/auth/me/photo'))
        if (!active) return
        if (response.status === 401) { onExpiredRef.current(); return }
        if (!response.ok) throw new Error('PHOTO_UNAVAILABLE')
        const next = decodePhoto(await response.json())
        if (active) { setState(next); setError('') }
      } catch { if (active) setError(t('photo.settingsError')) }
    })()
    return () => { active = false }
  }, [owner, revision, initialState, t])
  return { state, error, retry: () => reload(n => n + 1), update: setState }
}

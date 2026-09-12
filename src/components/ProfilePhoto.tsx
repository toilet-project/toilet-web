'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createApiUrl } from '../config/api'
import { AuthExpiredError } from '../api/auth'
import { decodePhoto, ownPhotoPath, PROFILE_PHOTO_ENABLED, type PhotoState } from '../lib/profilePhoto'

const CHANGED = 'geupddong-profile-photo-changed'
/** Blob URLs are scoped to the mounted account/view and are revoked on unmount. No Next image proxy cache. */
export function PhotoImage({ path, privatePhoto = false, fallback, label = '프로필 사진' }: {
  path: string | null; privatePhoto?: boolean; fallback: ReactNode; label?: string;
}) {
  const [image, setImage] = useState<{ path: string; url: string } | null>(null)
  useEffect(() => {
    if (!PROFILE_PHOTO_ENABLED || !path) return
    let active = true, objectUrl: string | null = null
    let request: AbortController | null = null
    let generation = 0
    const load = async () => {
      const current = ++generation
      request?.abort(); request = new AbortController()
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null }
      setImage(null)
      const timer = setTimeout(() => request?.abort(), 10_000)
      try {
        const response = await fetch(createApiUrl(path), { credentials: privatePhoto ? 'include' : 'omit', cache: 'no-store', signal: request.signal })
        if (!response.ok || !response.headers.get('content-type')?.startsWith('image/webp')) return
        const blob = await response.blob()
        if (!active || current !== generation || blob.size > 100_000) return
        objectUrl = URL.createObjectURL(blob); setImage({ path, url: objectUrl })
      } catch { /* Keep the default avatar. */ }
      finally { clearTimeout(timer) }
    }
    const changed = () => { void load() }
    void load(); window.addEventListener(CHANGED, changed)
    return () => { active = false; generation++; request?.abort(); window.removeEventListener(CHANGED, changed); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [path, privatePhoto])
  return image?.path === path ? <img src={image.url} alt={label} width={256} height={256} onError={() => setImage(null)} /> : fallback
}

export function OwnPhoto({ state, fallback }: { state: PhotoState | null; fallback: ReactNode }) {
  return <PhotoImage path={state?.imageVersion ? ownPhotoPath(state.imageVersion) : null} privatePhoto fallback={fallback} />
}

export function PhotoPreferences({ state, onSaved, onExpired }: { state: PhotoState; onSaved: (state: PhotoState) => void; onExpired: () => void }) {
  const [useSocial, setUseSocial] = useState(state.useSocial)
  const [publicPhoto, setPublicPhoto] = useState(state.publicPhoto)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const alive = useRef(false), busy = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  async function save() {
    if (busy.current) return
    busy.current = true; setSaving(true); setMessage('')
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 15_000)
    try {
      const response = await fetch(createApiUrl('/api/v1/auth/me/photo'), { method: 'PATCH', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ useSocial, publicPhoto: useSocial && publicPhoto }), signal: abort.signal })
      if (response.status === 401) throw new AuthExpiredError()
      if (!response.ok) throw new Error()
      const next = decodePhoto(await response.json())
      if (!alive.current) return
      onSaved(next); window.dispatchEvent(new Event(CHANGED))
      setMessage(next.useSocial ? '사진 설정을 저장했어요. 소셜 사진은 다음 로그인 때 확인해요.' : '소셜 사진 사용을 중단했어요.')
    } catch (error) {
      if (!alive.current) return
      if (error instanceof AuthExpiredError) onExpired()
      else setMessage('저장 여부를 확인하지 못했어요. 설정을 다시 열어 확인한 뒤 시도해 주세요.')
    } finally { clearTimeout(timer); busy.current = false; if (alive.current) setSaving(false) }
  }
  if (!state.available) return <p>소셜 프로필 사진 기능을 준비하고 있어요.</p>
  return <fieldset className="profile-photo-preferences" disabled={saving}>
    <legend>소셜 프로필 사진</legend>
    <label><input type="checkbox" checked={useSocial} onChange={e => { setUseSocial(e.target.checked); if (!e.target.checked) setPublicPhoto(false) }} />소셜 사진 사용</label>
    <p>동의한 소셜 사진을 작은 이미지로 보관해요. 원본은 보관하지 않으며, 사용 중단이나 탈퇴 시 사진을 삭제해요.</p>
    <label htmlFor="profile-photo-visibility">사진 공개 범위</label>
    <select id="profile-photo-visibility" disabled={!useSocial} value={publicPhoto ? 'public' : 'private'} onChange={e => setPublicPhoto(e.target.value === 'public')}>
      <option value="private">비공개 · 나만 보기</option><option value="public">공개 · 리뷰 작성자 사진에 표시</option>
    </select>
    <p>비공개일 때 다른 사람에게는 기본 아바타가 보여요. 공개했던 사진을 다른 사람이 이미 저장한 경우 그 사본은 회수할 수 없어요.</p>
    <button type="button" onClick={() => void save()} disabled={saving}>{saving ? '저장 중…' : '사진 설정 저장'}</button>
    {message && <p role="status">{message}</p>}
  </fieldset>
}

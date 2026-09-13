'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createApiUrl } from '../config/api'
import { AuthExpiredError } from '../api/auth'
import { decodePhoto, ownPhotoPath, PROFILE_PHOTO_ENABLED, type PhotoState } from '../lib/profilePhoto'
import { ProfilePhotoCropDialog } from './ProfilePhotoCropDialog'

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
      request?.abort(); const controller = new AbortController(); request = controller
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null }
      setImage(null)
      const timer = setTimeout(() => controller.abort(), 10_000)
      try {
        const response = await fetch(createApiUrl(path), { credentials: privatePhoto ? 'include' : 'omit', cache: 'no-store', signal: controller.signal })
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
  const [publicPhoto, setPublicPhoto] = useState(state.publicPhoto)
  const [editorFile, setEditorFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const alive = useRef(false), busy = useRef(false), fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  async function request(method: 'PUT' | 'PATCH' | 'DELETE', body?: BodyInit, contentType?: string) {
    if (busy.current) return false
    busy.current = true; setSaving(true); setMessage('')
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 15_000)
    try {
      const response = await fetch(createApiUrl('/api/v1/auth/me/photo'), { method, credentials: 'include', cache: 'no-store',
        headers: contentType ? { 'Content-Type': contentType } : undefined, body, signal: abort.signal })
      if (response.status === 401) throw new AuthExpiredError()
      if (!response.ok) throw new Error()
      const next = decodePhoto(await response.json())
      if (!alive.current) return false
      setPublicPhoto(next.publicPhoto)
      onSaved(next); window.dispatchEvent(new Event(CHANGED))
      if (fileInput.current) fileInput.current.value = ''
      setMessage(method === 'PUT' ? '프로필 사진을 저장했어요.' : method === 'DELETE' ? '프로필 사진을 삭제했어요.' : '사진 공개 범위를 저장했어요.')
      return true
    } catch (error) {
      if (!alive.current) return false
      if (error instanceof AuthExpiredError) onExpired()
      else setMessage('저장 여부를 확인하지 못했어요. 설정을 다시 열어 확인한 뒤 시도해 주세요.')
      return false
    } finally { clearTimeout(timer); busy.current = false; if (alive.current) setSaving(false) }
  }
  function selectFile(file: File | null) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size <= 0 || file.size > 2 * 1024 * 1024) {
      setMessage('JPEG, PNG, WebP 파일을 2MB 이하로 선택해 주세요.'); if (fileInput.current) fileInput.current.value = ''; return
    }
    setMessage(''); setEditorFile(file)
  }
  function closeEditor() {
    setEditorFile(null)
    if (fileInput.current) fileInput.current.value = ''
  }
  if (!state.available) return <p>프로필 사진 기능을 준비하고 있어요.</p>
  return <fieldset className="profile-photo-preferences" disabled={saving && !editorFile}>
    <legend>프로필 사진</legend>
    <p>신규 가입 때 동의한 카카오 사진은 한 번만 가져와요. 이후에는 여기에서 직접 바꾸거나 삭제할 수 있어요.</p>
    <button type="button" className="profile-photo-picker" onClick={() => fileInput.current?.click()}>{state.imageVersion ? '보관함에서 새 사진 선택' : '보관함에서 사진 선택'}</button>
    <input ref={fileInput} className="profile-photo-file" id="profile-photo-file" type="file" tabIndex={-1} aria-hidden="true" accept="image/jpeg,image/png,image/webp" onChange={event => selectFile(event.target.files?.[0] ?? null)} />
    <small>JPEG, PNG, WebP · 최대 2MB · 고른 사진은 기기에서 먼저 자르고, 선택한 정사각형 영역만 전송해 최대 256×256 WebP로 보관해요.</small>
    <label htmlFor="profile-photo-visibility">사진 공개 범위</label>
    <select id="profile-photo-visibility" disabled={!state.imageVersion} value={publicPhoto ? 'public' : 'private'} onChange={e => setPublicPhoto(e.target.value === 'public')}>
      <option value="private">비공개 · 나만 보기</option><option value="public">공개 · 리뷰 작성자 사진에 표시</option>
    </select>
    <p>비공개일 때 다른 사람에게는 기본 아바타가 보여요. 공개했던 사진을 다른 사람이 이미 저장한 경우 그 사본은 회수할 수 없어요.</p>
    <button type="button" onClick={() => void request('PATCH', JSON.stringify({ publicPhoto }), 'application/json')} disabled={saving || !state.imageVersion}>{saving ? '저장 중…' : '공개 범위 저장'}</button>
    {state.imageVersion && <button type="button" onClick={() => void request('DELETE')} disabled={saving}>프로필 사진 삭제</button>}
    {message && <p role="status">{message}</p>}
    {editorFile && <ProfilePhotoCropDialog file={editorFile} onClose={closeEditor} onApply={cropped => request('PUT', cropped, 'image/webp')} />}
  </fieldset>
}

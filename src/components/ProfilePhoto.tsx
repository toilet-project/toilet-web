'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { createApiUrl } from '../config/api'
import { AuthExpiredError } from '../api/auth'
import { decodePhoto, ownPhotoPath, publicPhotoPath, PROFILE_PHOTO_ENABLED, type PhotoState } from '../lib/profilePhoto'
import { useDialogFocus } from '../lib/useDialogFocus'
import { ProfilePhotoCropDialog } from './ProfilePhotoCropDialog'

const CHANGED = 'geupddong-profile-photo-changed'
const VISIBILITY_CHANGED = 'geupddong-profile-photo-visibility-changed'
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
        const response = await fetch(createApiUrl(path), { credentials: privatePhoto ? 'include' : 'omit', cache: 'default', signal: controller.signal })
        if (!response.ok || !response.headers.get('content-type')?.startsWith('image/webp')) return
        const blob = await response.blob()
        if (!active || current !== generation || blob.size > 100_000) return
        objectUrl = URL.createObjectURL(blob); setImage({ path, url: objectUrl })
      } catch { /* Keep the default avatar. */ }
      finally { clearTimeout(timer) }
    }
    const changed = () => { void load() }
    void load(); window.addEventListener(CHANGED, changed)
    if (!privatePhoto) window.addEventListener(VISIBILITY_CHANGED, changed)
    return () => {
      active = false; generation++; request?.abort(); window.removeEventListener(CHANGED, changed)
      if (!privatePhoto) window.removeEventListener(VISIBILITY_CHANGED, changed)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path, privatePhoto])
  return image?.path === path ? <img src={image.url} alt={label} width={256} height={256} onError={() => setImage(null)} /> : fallback
}

export function OwnPhoto({ state, fallback }: { state: PhotoState | null; fallback: ReactNode }) {
  return <PhotoImage path={state?.imageVersion ? ownPhotoPath(state.imageVersion) : null} privatePhoto fallback={fallback} />
}

async function mutatePhoto(method: 'PUT' | 'PATCH' | 'DELETE', body?: BodyInit, contentType?: string) {
  const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 15_000)
  try {
    const response = await fetch(createApiUrl('/api/v1/auth/me/photo'), { method, credentials: 'include', cache: 'no-store',
      headers: contentType ? { 'Content-Type': contentType } : undefined, body, signal: abort.signal })
    if (response.status === 401) throw new AuthExpiredError()
    if (!response.ok) throw new Error('PHOTO_WRITE_FAILED')
    return decodePhoto(await response.json())
  } finally { clearTimeout(timer) }
}

function announcePhotoChange() { window.dispatchEvent(new Event(CHANGED)) }
function announcePhotoVisibilityChange() { window.dispatchEvent(new Event(VISIBILITY_CHANGED)) }
function warmPublicPhoto(state: PhotoState) {
  const path=state.publicPhoto && state.imageVersion ? publicPhotoPath(state.imageVersion) : null
  if (path) void fetch(createApiUrl(path), { credentials: 'omit', cache: 'default' }).catch(() => undefined)
}

export function PhotoActions({ state, loadError, onRetry, onSaved, onExpired, onOpen, onNotice }: {
  state: PhotoState | null
  loadError: string
  onRetry: () => void
  onSaved: (state: PhotoState) => void
  onExpired: () => void
  onOpen: () => void
  onNotice: (message: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [editorFile, setEditorFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const alive = useRef(false), busy = useRef(false), fileInput = useRef<HTMLInputElement>(null)
  const closeMenu = () => { if (!busy.current) { setMenuOpen(false); setError(''); if (fileInput.current) fileInput.current.value = '' } }
  const dialog = useDialogFocus(menuOpen, closeMenu)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (!menuOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [menuOpen])
  async function request(method: 'PUT' | 'DELETE', body?: BodyInit, contentType?: string) {
    if (busy.current) return false
    busy.current = true; setSaving(true); setError('')
    try {
      const next = await mutatePhoto(method, body, contentType)
      if (!alive.current) return false
      onSaved(next); announcePhotoChange(); if (method === 'PUT') warmPublicPhoto(next)
      if (fileInput.current) fileInput.current.value = ''
      onNotice(method === 'PUT' ? '프로필 사진을 저장했어요.' : '프로필 사진을 삭제했어요.')
      if (method === 'DELETE') setMenuOpen(false)
      return true
    } catch (reason) {
      if (!alive.current) return false
      if (reason instanceof AuthExpiredError) { setMenuOpen(false); onExpired() }
      else if (method === 'DELETE') setError('사진을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.')
      return false
    } finally { busy.current = false; if (alive.current) setSaving(false) }
  }
  function selectFile(file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/') || file.size <= 0) {
      setError('사진 파일을 선택해 주세요.'); if (fileInput.current) fileInput.current.value = ''; return
    }
    setError(''); setMenuOpen(false); setEditorFile(file)
  }
  function closeEditor() {
    setEditorFile(null)
    if (fileInput.current) fileInput.current.value = ''
  }
  return <>
    <button type="button" className="mobile-profile-edit" aria-label="프로필 사진 변경" onClick={() => { onOpen(); setError(''); setMenuOpen(true) }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m10 3-.6 2.2-2 .9-2-.7-2 3.4 1.6 1.5v2.4l-1.6 1.5 2 3.4 2-.7 2 .9L10 20h4l.6-2.2 2-.9 2 .7 2-3.4-1.6-1.5v-2.4l1.6-1.5-2-3.4-2 .7-2-.9L14 3Z" /><circle cx="12" cy="11.5" r="3" /></svg></button>
    <input ref={fileInput} className="profile-photo-file" id="profile-photo-file" type="file" tabIndex={-1} aria-hidden="true" accept="image/*" onChange={event => selectFile(event.target.files?.[0] ?? null)} />
    {menuOpen && createPortal(<div className="profile-photo-action-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) closeMenu() }}>
      <section ref={dialog} className="profile-photo-action-sheet" role="dialog" aria-modal="true" aria-label="프로필 사진 메뉴" tabIndex={-1}>
        <h2>프로필 사진</h2>
        {loadError ? <div className="profile-photo-action-status" role="status"><p>{loadError}</p><button type="button" onClick={() => { onRetry(); setError('') }}>다시 불러오기</button></div>
          : !state ? <p role="status">사진 설정을 불러오는 중…</p>
          : !state.available ? <p role="status">프로필 사진 기능을 준비하고 있어요.</p>
          : <div className="profile-photo-action-list">
            <button type="button" onClick={() => fileInput.current?.click()} disabled={saving}>보관함에서 사진 선택</button>
            {state.imageVersion && <button type="button" className="profile-photo-delete" onClick={() => void request('DELETE')} disabled={saving}>{saving ? '삭제 중…' : '프로필 사진 삭제'}</button>}
          </div>}
        {error && <p className="profile-photo-action-error" role="alert">{error}</p>}
        <button type="button" className="profile-photo-action-cancel" onClick={closeMenu} disabled={saving}>취소</button>
      </section>
    </div>, document.body)}
    {editorFile && <ProfilePhotoCropDialog file={editorFile} onClose={closeEditor} onApply={cropped => request('PUT', cropped, cropped.type)} />}
  </>
}

export function PhotoVisibilityPreference({ state, onSaved, onExpired }: { state: PhotoState; onSaved: (state: PhotoState) => void; onExpired: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const alive = useRef(false), busy = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const toggle = async () => {
    if (busy.current || !state.imageVersion || !state.available) return
    busy.current = true; setSaving(true); setError('')
    try {
      const next = await mutatePhoto('PATCH', JSON.stringify({ publicPhoto: !state.publicPhoto }), 'application/json')
      if (!alive.current) return
      onSaved(next); announcePhotoVisibilityChange(); if (next.publicPhoto) warmPublicPhoto(next)
    } catch (reason) {
      if (!alive.current) return
      if (reason instanceof AuthExpiredError) onExpired()
      else setError('사진 공개 설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally { busy.current = false; if (alive.current) setSaving(false) }
  }
  if (!state.available) return null
  return <section className="profile-photo-visibility" aria-label="사진 공개 설정">
    <div><strong>리뷰에 사진 공개</strong><small>{state.imageVersion ? '공개하면 작성한 리뷰에 프로필 사진이 표시돼요.' : '프로필 사진을 등록하면 공개할 수 있어요.'}</small></div>
    <button type="button" className="profile-photo-switch" role="switch" aria-checked={state.publicPhoto} aria-label="리뷰에 프로필 사진 공개" disabled={!state.imageVersion || saving} onClick={() => void toggle()}><i aria-hidden="true" /><span>{state.publicPhoto ? 'ON' : 'OFF'}</span></button>
    {error && <p role="alert">{error}</p>}
  </section>
}

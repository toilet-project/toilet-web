'use client'
import { useEffect, useRef, useState } from 'react'
import { AuthExpiredError, updateNickname, type AuthProfile } from '../api/auth'
import { useLocale, useMessages } from '../i18n/context'
import { accountError } from '../i18n/accountLabels'
import { growthText } from '../i18n/growthText'
import { useDialogFocus } from '../lib/useDialogFocus'
import { useProfilePhoto } from '../lib/useProfilePhoto'
import { PROFILE_PHOTO_ENABLED } from '../lib/profilePhoto'
import { OwnPhoto, PhotoActions, PhotoVisibilityPreference } from './ProfilePhoto'

export function AccountProfileEditor({ profile, onProfile, onClose, onExpired }: { profile: AuthProfile; onProfile: (profile: AuthProfile) => void; onClose: () => void; onExpired: () => void }) {
  const locale = useLocale(), t = useMessages(), g = growthText(locale)
  const photo = useProfilePhoto(profile.userId, onExpired, profile.profilePhoto ?? undefined)
  const [nickname, setNickname] = useState(profile.displayName || ''), [saving, setSaving] = useState(false), [message, setMessage] = useState('')
  const active = useRef(true), current = useRef(profile)
  useEffect(() => { current.current = profile }, [profile])
  const close = () => { if (!saving) onClose() }
  const dialog = useDialogFocus(true, close)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])
  const savedPhoto = (next: NonNullable<AuthProfile['profilePhoto']>) => { photo.update(next); onProfile({ ...current.current, profilePhoto: next }) }
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
    setSaving(true); setMessage('')
    try { const result = await updateNickname(nickname); if (!active.current) return; onProfile({ ...current.current, displayName: result.displayName }); onClose() }
    catch (reason) { if (!active.current) return; if (reason instanceof AuthExpiredError) onExpired(); else setMessage(accountError(reason, locale, 'account.nicknameFailed')) }
    finally { if (active.current) setSaving(false) }
  }
  return <div className="account-profile-edit-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close() }}><section className="account-profile-editor" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="account-profile-edit-title" tabIndex={-1}>
    <header><h2 id="account-profile-edit-title">{g.editProfile}</h2><button type="button" disabled={saving} onClick={close} aria-label={t('common.close')}>×</button></header>
    <div className="account-profile-editor-photo"><span className="account-home-avatar"><OwnPhoto state={photo.state} fallback={<span>{(profile.displayName || 'G')[0]}</span>} /></span>{PROFILE_PHOTO_ENABLED && <PhotoActions state={photo.state} loadError={photo.error} onRetry={photo.retry} onSaved={savedPhoto} onExpired={onExpired} onOpen={() => setMessage('')} onNotice={setMessage} />}</div>
    <form onSubmit={event => { void save(event) }}><label htmlFor="account-home-nickname">{t('account.nickname')}</label><input id="account-home-nickname" value={nickname} onChange={event => setNickname(event.target.value)} minLength={2} maxLength={30} autoComplete="nickname" required disabled={saving} /><small>{t('account.nicknameHelp')}</small>
      {PROFILE_PHOTO_ENABLED && (photo.error ? <p role="status">{photo.error}<button type="button" onClick={photo.retry}>{t('common.retry')}</button></p> : photo.state ? <PhotoVisibilityPreference state={photo.state} onSaved={savedPhoto} onExpired={onExpired} /> : <p>{t('account.photoLoading')}</p>)}
      {message && <p role="status">{message}</p>}<footer><button type="button" disabled={saving} onClick={close}>{t('common.cancel')}</button><button type="submit" disabled={saving || nickname.trim().length < 2}>{saving ? t('common.saving') : t('common.save')}</button></footer>
    </form></section></div>
}

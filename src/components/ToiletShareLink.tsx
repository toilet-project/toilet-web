'use client'

import { useState } from 'react'
import { useLocale } from '../i18n/context'
import { buildFacilityShareLink } from '../lib/shareLink'

const copy = {
  ko: ['공유', '링크 복사', '링크를 복사했어요', '복사하지 못했어요. 다시 시도해 주세요.'],
  en: ['Share', 'Copy link', 'Link copied', 'Could not copy. Please try again.'],
  ja: ['共有', 'リンクをコピー', 'リンクをコピーしました', 'コピーできませんでした。再度お試しください。'],
  'zh-CN': ['分享', '复制链接', '链接已复制', '无法复制，请重试。'],
  'zh-TW': ['分享', '複製連結', '已複製連結', '無法複製，請再試一次。'],
  'zh-HK': ['分享', '複製連結', '已複製連結', '無法複製，請再試一次。'],
}

/** Outside cached facility content: controls do not invalidate R2 facility fragments. */
export function ToiletShareLink({ toiletId }: { toiletId: number }) {
  const locale = useLocale(), text = copy[locale]
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  async function act(method: 'share' | 'copy') {
    if (busy) return
    setBusy(true); setStatus('')
    try {
      if (method === 'share' && typeof navigator.share === 'function') {
        await navigator.share({ url: buildFacilityShareLink(toiletId, locale, 'share') })
      } else {
        const url = buildFacilityShareLink(toiletId, locale, 'copy')
        if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(url)
        else {
          const area = document.createElement('textarea')
          area.value = url; area.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
          document.body.append(area); area.select()
          try { if (!document.execCommand('copy')) throw new Error('Copy failed') } finally { area.remove() }
        }
        setStatus(text[2])
      }
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus(text[3]) }
    finally { setBusy(false) }
  }
  return <div className="toilet-share-links">
    <button type="button" disabled={busy} onClick={() => void act('share')}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></svg>{text[0]}</button>
    <button type="button" disabled={busy} onClick={() => void act('copy')}>{text[1]}</button>
    <span role="status">{status}</span>
  </div>
}

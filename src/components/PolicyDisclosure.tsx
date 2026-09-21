import { useLocale, useMessages } from '../i18n/context'
import { createElement, useEffect, useId, useState, type ReactNode } from 'react'
import { policyDisplayPath } from '../i18n/accountLabels'
import './policy-disclosure.css'

// Render the document linked by the API, including archived versions. Never substitute
// today's terms for an older agreement or inject fetched HTML/scripts into the app.
function policyUrl(path: string) {
  const url = new URL(path, window.location.origin)
  if (url.origin !== window.location.origin || url.username || url.password || url.search || !/^\/(?:(?:en\/)?policies\/(?:terms|privacy|location|all)|policy-history\/\d{4}-\d{2}-\d{2}(?:\.html)?)$/.test(url.pathname)) throw new Error('지원하지 않는 약관 주소입니다.')
  return url
}

function documentContent(html: string, url: URL): ReactNode {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const article = doc.querySelector('.policy-document')
  const fragment = url.hash ? doc.getElementById(decodeURIComponent(url.hash.slice(1))) : null
  const root = url.hash ? (fragment && article?.contains(fragment) ? fragment : null) : article
  if (!root) throw new Error('약관 원문을 찾지 못했습니다.')
  const render = (node: ChildNode, key: number): ReactNode => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent
    if (!(node instanceof Element)) return null
    // The disclosure supplies its own locale-aware translation notice and source link.
    if (node.classList.contains('policy-translation-note')) return null
    const tag = node.tagName.toLowerCase()
    if (['script', 'style', 'iframe', 'object', 'form', 'nav', 'header', 'footer'].includes(tag)) return null
    const children = Array.from(node.childNodes, render)
    if (tag === 'a') {
      const href = new URL(node.getAttribute('href') || '', url)
      if (href.protocol === 'mailto:' || (href.origin === url.origin && !href.username && !href.password)) return <a key={key} href={href.href} target="_blank" rel="noreferrer">{children}</a>
      return <span key={key}>{children}</span>
    }
    const safeTag = /^h[1-6]$/.test(tag) ? 'h3' : ['p', 'section', 'div', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'strong', 'em', 'small', 'b', 'br'].includes(tag) ? tag : 'span'
    return createElement(safeTag, { key }, ...children)
  }
  return Array.from(root.childNodes, render)
}

export function PolicyDisclosure({ title, meta, contentPath, version, selection }: { title: string; meta: string; contentPath: string; version?: string; selection?: ReactNode }) {
  const t = useMessages(), locale = useLocale()
  const displayPath = policyDisplayPath(contentPath, locale, version)
  const translated = displayPath.startsWith('/en/policies/')
  const id = useId()
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState<{ path: string; content: ReactNode } | null>(null)
  const content = loaded?.path === displayPath ? loaded.content : null
  const [errorPath, setErrorPath] = useState<string | null>(null)
  const error = errorPath === displayPath
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!open || content) return
    const controller = new AbortController()
    let active = true
    void (async () => {
      try {
        const url = policyUrl(displayPath)
        // Static hosting canonicalizes archive.html to archive. Only same-origin
        // requests are allowed; never follow the agreement into another document.
        const response = await fetch(url.href, { signal: controller.signal, credentials: 'omit', mode: 'same-origin' })
        if (!response.ok) throw new Error('약관을 불러오지 못했습니다.')
        const finalUrl = policyUrl(response.url)
        if (finalUrl.pathname !== url.pathname && finalUrl.pathname !== url.pathname.replace(/\.html$/, '')) throw new Error('약관 주소가 변경되었습니다.')
        const value = documentContent(await response.text(), url)
        if (active) setLoaded({ path: displayPath, content: value })
      } catch { if (active) setErrorPath(displayPath) }
    })()
    return () => { active = false; controller.abort() }
  }, [open, content, displayPath, attempt])
  return <div className={`policy-disclosure${open ? ' is-open' : ''}`}>
    <div className="policy-disclosure-row">
      {selection}
      <button type="button" className="policy-disclosure-toggle" aria-expanded={open} aria-controls={id} onClick={() => { setOpen(value => !value); setErrorPath(null) }}>
        <span className="policy-disclosure-label"><strong>{title}</strong><small>{meta}{locale !== 'ko' ? ` · ${t(translated ? 'policy.englishCopy' : 'policy.koreanArchive')}` : ''}</small></span>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
    </div>
    {open && <div id={id} className="policy-disclosure-content" role="region" aria-label={title} lang={locale}>
      {translated && <p className="policy-translation-note">{t('policy.englishNote')} <a href={contentPath} target="_blank" rel="noreferrer">{t('policy.viewOriginal')}</a></p>}
      {content ? <div lang={translated ? 'en' : 'ko'}>{content}</div> : error ? <p role="alert">{t('policy.error')} <button type="button" onClick={() => { setErrorPath(null); setAttempt(value => value + 1) }}>{t('common.retry')}</button></p> : <p role="status">{t('policy.loading')}</p>}
    </div>}
  </div>
}

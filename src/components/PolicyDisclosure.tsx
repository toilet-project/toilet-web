import { createElement, useEffect, useId, useState, type ReactNode } from 'react'
import './policy-disclosure.css'

// Render the document linked by the API, including archived versions. Never substitute
// today's terms for an older agreement or inject fetched HTML/scripts into the app.
function policyUrl(path: string) {
  const url = new URL(path, window.location.origin)
  if (url.origin !== window.location.origin || url.search || !/^\/(?:policies\/(?:terms|privacy|location|all)|policy-history\/\d{4}-\d{2}-\d{2}(?:\.html)?)$/.test(url.pathname)) throw new Error('지원하지 않는 약관 주소입니다.')
  return url
}

function documentContent(html: string, url: URL): ReactNode {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const article = doc.querySelector('.policy-document')
  const fragment = url.hash ? doc.getElementById(decodeURIComponent(url.hash.slice(1))) : null
  const root = fragment && article?.contains(fragment) ? fragment : article
  if (!root) throw new Error('약관 원문을 찾지 못했습니다.')
  const render = (node: ChildNode, key: number): ReactNode => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent
    if (!(node instanceof Element)) return null
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

export function PolicyDisclosure({ title, meta, contentPath, selection }: { title: string; meta: string; contentPath: string; selection?: ReactNode }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState<ReactNode>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!open || content) return
    const controller = new AbortController()
    let active = true
    void (async () => {
      try {
        const url = policyUrl(contentPath)
        // Static hosting canonicalizes archive.html to archive. Only same-origin
        // requests are allowed; never follow the agreement into another document.
        const response = await fetch(url.href, { signal: controller.signal, credentials: 'omit', mode: 'same-origin' })
        if (!response.ok) throw new Error('약관을 불러오지 못했습니다.')
        const finalUrl = policyUrl(response.url)
        if (finalUrl.pathname !== url.pathname && finalUrl.pathname !== url.pathname.replace(/\.html$/, '')) throw new Error('약관 주소가 변경되었습니다.')
        const value = documentContent(await response.text(), url)
        if (active) setContent(value)
      } catch { if (active) setError(true) }
    })()
    return () => { active = false; controller.abort() }
  }, [open, content, contentPath, attempt])
  return <div className={`policy-disclosure${open ? ' is-open' : ''}`}>
    <div className="policy-disclosure-row">
      {selection}
      <button type="button" className="policy-disclosure-toggle" aria-expanded={open} aria-controls={id} onClick={() => { setOpen(value => !value); setError(false) }}>
        <span className="policy-disclosure-label"><strong>{title}</strong><small>{meta}</small></span>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
    </div>
    {open && <div id={id} className="policy-disclosure-content" role="region" aria-label={`${title} 내용`}>
      {content || (error ? <p role="alert">약관을 불러오지 못했어요. <button type="button" onClick={() => { setError(false); setAttempt(value => value + 1) }}>다시 불러오기</button></p> : <p role="status">약관을 불러오는 중…</p>)}
    </div>}
  </div>
}

'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { LOCALE_OPTIONS, type Locale } from '../i18n/locale'
import { message } from '../i18n/messages'
import './language-selector.css'

/** Controlled by the public route owner; no navigation, storage or authentication side effects. */
export function LanguageSelector({ locale, onSelect }: { locale: Locale; onSelect: (locale: Locale) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const current = LOCALE_OPTIONS.find(option => option.locale === locale)!

  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  const close = () => { setOpen(false); trigger.current?.focus() }
  return <div ref={root} className="language-selector" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
  }} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close() }
  }}>
    <button ref={trigger} type="button" className="language-selector-trigger"
      aria-label={`${message(locale, 'language.choose')}: ${current.name}`}
      title={`${message(locale, 'language.choose')}: ${current.name}`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => setOpen(value => !value)} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) }
      }}>
      <img className="language-selector-flag" src={current.flag} width="26" height="18" alt="" aria-hidden="true" />
    </button>
    {open && <div ref={menu} id={menuId} className="language-selector-menu" role="menu" aria-label={message(locale, 'language.choose')}
      onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const options = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])
        const index = options.indexOf(document.activeElement as HTMLButtonElement)
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
        options[target]?.focus()
      }}>
      {LOCALE_OPTIONS.map(option => <button key={option.locale} type="button" role="menuitemradio"
        aria-checked={locale === option.locale} aria-label={option.name} lang={option.languageTag}
        onClick={() => { close(); if (option.locale !== locale) onSelect(option.locale) }}>
        <img className="language-selector-flag" src={option.flag} width="26" height="18" alt="" aria-hidden="true" />
        <span>{option.label}</span>
        {locale === option.locale && <svg className="language-selector-check" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 10 4 4 8-8" /></svg>}
      </button>)}
    </div>}
  </div>
}

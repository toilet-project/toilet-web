'use client'
import { createContext, useContext } from 'react'
import type { Locale } from './locale'
import { message, type MessageKey } from './messages'

export const LocaleContext = createContext<Locale>('ko')
export const useLocale = () => useContext(LocaleContext)
export function useMessages() {
  const locale = useLocale()
  return (key: MessageKey) => message(locale, key)
}

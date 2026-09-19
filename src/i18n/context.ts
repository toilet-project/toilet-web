'use client'
import { createContext, useCallback, useContext } from 'react'
import type { Locale } from './locale'
import { message, type MessageKey, type MessageValues } from './messages'

export const LocaleContext = createContext<Locale>('ko')
export const useLocale = () => useContext(LocaleContext)
export function useMessages() {
  const locale = useLocale()
  return useCallback((key: MessageKey, values?: MessageValues) => message(locale, key, values), [locale])
}

'use client'
import Link from 'next/link'
import { NotFoundAnalytics } from '../components/NotFoundAnalytics'
import { useLocale, useMessages } from '../i18n/context'
import { localizedPublicPath } from '../i18n/routes'

export default function NotFound() {
  const locale = useLocale(), t = useMessages()
  return <main className="app-error"><NotFoundAnalytics /><h1>{t('error.notFound')}</h1><Link href={localizedPublicPath('/', locale)!}>{t('detail.back')}</Link></main>
}

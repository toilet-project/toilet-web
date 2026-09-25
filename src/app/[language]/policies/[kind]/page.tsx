import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AsianPolicyPage } from '../../../../components/AsianPolicyPage'
import { asianLocaleForSegment } from '../../../../i18n/asianRoutes'
import { pick, policyTitles, type AsianPolicyKind } from '../../../../i18n/asianPolicyData'
import { ENGLISH_UI_ENABLED } from '../../../../i18n/feature'
import { socialMetadata } from '../../../../i18n/pageSeo'

type Props = { params: Promise<{ language: string; kind: string }> }
const segments = ['ja', 'zh-cn', 'zh-tw', 'zh-hk'] as const
const isKind = (kind: string): kind is AsianPolicyKind => Object.hasOwn(policyTitles, kind)
export function generateStaticParams() { return segments.flatMap(language => Object.keys(policyTitles).map(kind => ({ language, kind }))) }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { language, kind } = await params, locale = asianLocaleForSegment(language)
  if (!ENGLISH_UI_ENABLED || !locale || !isKind(kind)) notFound()
  const title = `${pick(policyTitles[kind], locale)} | Geupddong`
  const summary = locale === 'ja' ? '韓国の公衆トイレ地図 Geupddong のポリシーを日本語で読むための翻訳です。'
    : locale === 'zh-CN' ? '韩国公共卫生间地图 Geupddong 的中文政策阅读译文。'
      : '韓國公眾廁所地圖 Geupddong 的中文政策閱讀譯文。'
  const description = `${pick(policyTitles[kind], locale)} — ${summary}`
  return { title: { absolute: title }, description, alternates: { canonical: `/${language}/policies/${kind}` },
    robots: { index: false, follow: false }, ...socialMetadata(title, description, `/${language}/policies/${kind}`, locale) }
}
export default async function Page({ params }: Props) {
  const { language, kind } = await params, locale = asianLocaleForSegment(language)
  if (!ENGLISH_UI_ENABLED || !locale || !isKind(kind)) notFound()
  return <AsianPolicyPage kind={kind} locale={locale} />
}

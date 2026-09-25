import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EnglishPolicyPage } from '../../../../components/EnglishPolicyPage'
import { englishPolicyTitles, type EnglishPolicyKind } from '../../../../i18n/policyTranslation'
import { ENGLISH_UI_ENABLED } from '../../../../i18n/feature'

type Props = { params: Promise<{ kind: string }> }
const isKind = (kind: string): kind is EnglishPolicyKind => Object.hasOwn(englishPolicyTitles, kind)
export function generateStaticParams() { return Object.keys(englishPolicyTitles).map(kind => ({ kind })) }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { kind } = await params
  if (!ENGLISH_UI_ENABLED || !isKind(kind)) notFound()
  const title = `${englishPolicyTitles[kind]} | Geupddong`
  const description = `${englishPolicyTitles[kind]} for Geupddong, a public restroom map for Korea. Read the English translation; the Korean policy is authoritative.`
  return { title: { absolute: title }, description,
    alternates: { canonical: `/en/policies/${kind}` }, robots: { index: false, follow: false },
    openGraph: { title, description, type: 'website', locale: 'en_US', siteName: 'Geupddong', url: `/en/policies/${kind}`, images: ['/og-image.png'] },
    twitter: { title, description, card: 'summary_large_image', images: ['/og-image.png'] } }
}
export default async function Page({ params }: Props) {
  const { kind } = await params
  if (!ENGLISH_UI_ENABLED || !isKind(kind)) notFound()
  return <EnglishPolicyPage kind={kind} />
}

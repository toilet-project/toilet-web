import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PolicyPage } from '../../../components/PolicyPage'

const titles = { terms: '서비스 이용약관', privacy: '개인정보 처리방침', location: '위치정보 이용 안내' }
type Kind = keyof typeof titles
type Props = { params: Promise<{ kind: string }> }
function isKind(kind: string): kind is Kind { return Object.hasOwn(titles, kind) }

export function generateStaticParams() {
  return Object.keys(titles).map(kind => ({ kind }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { kind } = await params
  if (!isKind(kind)) notFound()
  return { title: titles[kind], alternates: { canonical: `/policies/${kind}` } }
}

export default async function Page({ params }: Props) {
  const { kind } = await params
  if (!isKind(kind)) notFound()
  return <PolicyPage kind={kind} />
}

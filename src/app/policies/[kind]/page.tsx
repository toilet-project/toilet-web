import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PolicyPage } from '../../../components/PolicyPage'
import { socialMetadata } from '../../../i18n/pageSeo'

const titles = { terms: '서비스 이용약관', privacy: '개인정보 처리방침', location: '위치정보 이용 안내', all: '이용약관 및 서비스 정책' }
const descriptions = {
  terms: '급똥 서비스 이용약관입니다. 공중화장실 지도와 회원 서비스의 이용 조건, 이용자와 운영자의 권리 및 의무, 서비스 이용 제한과 책임에 관한 내용을 확인하세요.',
  privacy: '급똥 개인정보 처리방침입니다. 서비스 이용 과정에서 처리하는 개인정보의 항목과 목적, 보유 기간, 파기 절차, 이용자의 권리와 개인정보 관련 문의 방법을 확인하세요.',
  location: '급똥 위치정보 이용 안내입니다. 가까운 화장실 검색 등 위치 기반 기능에서 위치정보를 이용하는 목적과 방법, 보유 및 파기, 이용자의 권리를 확인하세요.',
  all: '급똥의 서비스 이용약관, 개인정보 처리방침과 위치정보 이용 안내를 한곳에서 확인하세요. 서비스 이용 조건과 개인정보·위치정보 처리 기준을 안내합니다.',
}
type Kind = keyof typeof titles
type Props = { params: Promise<{ kind: string }> }
function isKind(kind: string): kind is Kind { return Object.hasOwn(titles, kind) }

export function generateStaticParams() {
  return Object.keys(titles).map(kind => ({ kind }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { kind } = await params
  if (!isKind(kind)) notFound()
  const title = `${titles[kind]} | 급똥`, description = descriptions[kind], path = `/policies/${kind}`
  return { title: { absolute: title }, description, alternates: { canonical: path }, ...socialMetadata(title, description, path, 'ko') }
}

export default async function Page({ params }: Props) {
  const { kind } = await params
  if (!isKind(kind)) notFound()
  return <PolicyPage kind={kind} />
}

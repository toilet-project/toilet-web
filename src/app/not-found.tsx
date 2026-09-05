import Link from 'next/link'

export default function NotFound() {
  return <main className="app-error"><strong>페이지를 찾을 수 없습니다.</strong><Link href="/">지도로 돌아가기</Link></main>
}

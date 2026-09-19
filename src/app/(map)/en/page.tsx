import type { Metadata } from 'next'
import { ToiletRouteBridge } from '../../../components/ToiletRouteBridge'

export const metadata: Metadata = {
  alternates: { canonical: '/en' },
  openGraph: { title: 'Geupddong | Find public toilets nearby', url: '/en', images: ['/og-image.png'] },
}

export default function EnglishHomePage() {
  return <ToiletRouteBridge detail={null} locale="en" />
}

import { ToiletRouteBridge } from '../../../components/ToiletRouteBridge'
import { homeMetadata, homeStructuredData } from '../../../i18n/pageSeo'
import { safeJsonLd } from '../../../lib/seo'

export const metadata = homeMetadata('en')

export default function HomePage() {
  return <><ToiletRouteBridge detail={null} locale="en" /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(homeStructuredData('en')) }} /></>
}

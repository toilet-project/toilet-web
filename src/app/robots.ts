import type { MetadataRoute } from 'next'
import { robotsPolicy } from '../lib/robotsPolicy'

export default function robots(): MetadataRoute.Robots {
  return robotsPolicy(process.env.SITE_INDEXABLE === 'true')
}

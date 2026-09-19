import type { Locale } from './locale.ts'

// Exact structured labels only. Unknown categories remain the source value.
export function toiletTypeLabel(value: string | undefined, locale: Locale): string {
  const source = value?.trim() || '화장실'
  const labels: Record<string, string> = { '화장실': 'Restroom', '공중화장실': 'Public restroom', '공공화장실': 'Public restroom', '개방화장실': 'Public-access restroom', '개방 화장실': 'Public-access restroom', '간이화장실': 'Portable restroom', '이동화장실': 'Mobile restroom' }
  return locale === 'en' && Object.hasOwn(labels, source) ? labels[source] : source
}

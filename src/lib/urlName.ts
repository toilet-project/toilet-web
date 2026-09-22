/** Keep readable native-script names in paths; numeric codes and IDs carry identity. */
export function urlName(value: string) {
  return Array.from(value.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, ''))
    .slice(0, 72).join('').replace(/-$/, '') || 'restroom'
}

/** Accept old code-only paths and named paths whose suffix retains the same code. */
export function codeFromRegionSegment(segment: string, length: 2 | 5): string | null {
  if (/^\d+$/.test(segment)) return segment.length === length ? segment : null
  const match = /^([\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*)-(\d+)$/u.exec(segment)
  return match?.[2]?.length === length ? match[2] : null
}

/** Next's dynamic route params can retain percent-encoded native-script segments. */
export function decodedRouteSegment(segment: string): string | null {
  try {
    const decoded = decodeURIComponent(segment).normalize('NFC')
    return /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(decoded) ? decoded : null
  } catch { return null }
}

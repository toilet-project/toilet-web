/** User-facing addresses are a single value; keep the two source fields separate. */
export function getDisplayAddress(roadAddress?: string | null, jibunAddress?: string | null): string {
  return roadAddress?.trim() || jibunAddress?.trim() || ''
}

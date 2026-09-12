export const PROFILE_PHOTO_ENABLED = process.env.NEXT_PUBLIC_PROFILE_PHOTO_ENABLED === 'true'
export type PhotoState = { available: boolean; useSocial: boolean; publicPhoto: boolean; imageVersion: string | null }
export function decodePhoto(value: unknown): PhotoState {
  if (!value || typeof value !== 'object') throw new Error('사진 설정을 확인하지 못했어요.')
  const v = value as Record<string, unknown>
  if (typeof v.available !== 'boolean' || typeof v.useSocial !== 'boolean' || typeof v.publicPhoto !== 'boolean'
    || !(v.imageVersion === null || typeof v.imageVersion === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v.imageVersion))
    || v.publicPhoto && !v.useSocial || !v.useSocial && v.imageVersion !== null) throw new Error('사진 설정을 확인하지 못했어요.')
  return { available: v.available, useSocial: v.useSocial, publicPhoto: v.publicPhoto, imageVersion: v.imageVersion }
}
export function ownPhotoPath(version: string) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(version)) return null
  return `/api/v1/auth/me/photo/image?version=${version}`
}
export function reviewPhotoPath(toilet: number, review: string) {
  if (!Number.isSafeInteger(toilet) || toilet <= 0 || !/^[1-9]\d{0,18}$/.test(review)) return null
  return `/api/v1/toilets/${toilet}/reviews/${review}/photo`
}

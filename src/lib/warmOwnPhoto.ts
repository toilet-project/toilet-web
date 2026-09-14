import { createApiUrl } from '../config/api'
import { ownPhotoPath, PROFILE_PHOTO_ENABLED, type PhotoState } from './profilePhoto'

export function warmOwnPhoto(state: PhotoState | null | undefined) {
  if (!PROFILE_PHOTO_ENABLED || typeof window === 'undefined' || !state?.available || !state.imageVersion) return
  const path = ownPhotoPath(state.imageVersion)
  if (!path) return
  const image = new window.Image()
  const release = () => { image.onload = null; image.onerror = null }
  image.onload = release
  image.onerror = release
  image.decoding = 'async'
  image.src = createApiUrl(path)
}

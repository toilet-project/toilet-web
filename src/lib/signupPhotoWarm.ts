import type { PhotoState } from './profilePhoto'

type SignupProfile = { profilePhoto?: PhotoState | null }
type Pause = (milliseconds: number) => Promise<void>

// The Kakao download, image conversion and R2 write run after consent in a
// single background queue. Keep checking for about a minute so a slow first
// import still replaces the placeholder during the signup session.
export const SIGNUP_PHOTO_WARM_DELAYS_MS = [250, 500, 1000, 2000, 4000, 8000, 15000, 30000] as const

const pause: Pause = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))

export async function refreshSignupPhoto<T extends SignupProfile>(
  loadProfile: () => Promise<T | null>,
  acceptProfile: (profile: T) => boolean,
  wait: Pause = pause,
) {
  for (const delay of SIGNUP_PHOTO_WARM_DELAYS_MS) {
    await wait(delay)
    let profile: T | null
    try { profile = await loadProfile() }
    catch { return }
    if (!profile || !acceptProfile(profile) || profile.profilePhoto?.imageVersion) return
  }
}

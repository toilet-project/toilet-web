/** Some SDK searches cannot abort; invalidate their result as well as the signal. */
export function createPlaceSearchRequest() {
  let active: AbortController | null = null
  const cancel = () => { active?.abort(); active = null }
  return {
    cancel,
    begin() {
      cancel()
      const controller = new AbortController()
      active = controller
      return { signal: controller.signal, isCurrent: () => active === controller && !controller.signal.aborted }
    },
  }
}

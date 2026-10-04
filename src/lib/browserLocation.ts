type Locator = Pick<Geolocation, 'getCurrentPosition'>
export class BrowserLocationError extends Error {
  readonly code: number
  constructor(code: number) { super('Browser location unavailable'); this.code = code }
}

/** The browser timeout alone may never fire after a suspended iOS tab resumes. */
export function requestBrowserLocation(geolocation: Locator, signal: AbortSignal, highAccuracy = true): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let finished = false, attempt = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (position?: GeolocationPosition, error?: Error) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      if (position) resolve(position)
      else reject(error)
    }
    const abort = () => finish(undefined, new DOMException('Location request cancelled', 'AbortError'))
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true })
    const run = (accurate: boolean) => {
      const token = ++attempt
      clearTimeout(timer)
      const fail = (code: number) => {
        if (finished || token !== attempt) return
        if (accurate && code !== 1) run(false)
        else finish(undefined, new BrowserLocationError(code))
      }
      // One fresh lower-accuracy retry for unavailable GPS; never reuse a saved fix as success.
      timer = setTimeout(() => fail(3), accurate ? 8000 : 5000)
      try {
        geolocation.getCurrentPosition(position => {
          if (!finished && token === attempt) finish(position)
        }, error => fail(error.code), { enableHighAccuracy: accurate, maximumAge: 0, timeout: accurate ? 8000 : 5000 })
      } catch { fail(2) }
    }
    run(highAccuracy)
  })
}

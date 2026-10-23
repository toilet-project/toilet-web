type MapSdkScriptOptions = {
  provider: 'kakao' | 'naver'
  src: string
  language?: string
  ready: () => boolean
  initialize?: () => Promise<void>
  errorMessage: string
}

// The caller shares one promise per SDK. A failed script must be removed so a
// later map/search attempt can actually retry instead of waiting on a dead tag.
export function loadMapSdkScript(options: MapSdkScriptOptions): Promise<void> {
  if (options.ready()) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-geupddong-map-provider="${options.provider}"]`)
    const script = existing ?? document.createElement('script')
    let finished = false
    const finish = (error?: unknown) => {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      script.removeEventListener('load', loaded)
      script.removeEventListener('error', failed)
      if (error) { script.remove(); reject(error) }
      else resolve()
    }
    const failed = () => finish(new Error(options.errorMessage))
    const loaded = () => {
      try {
        Promise.resolve(options.initialize?.()).then(() => {
          if (options.ready()) finish()
          else failed()
        }, failed)
      } catch { failed() }
    }
    // Covers an SDK that downloads successfully but never finishes its own
    // secondary initialization, as well as a browser that never emits error.
    const timeout = setTimeout(failed, 20_000)
    script.addEventListener('load', loaded, { once: true })
    script.addEventListener('error', failed, { once: true })
    if (!existing) {
      script.dataset.geupddongMapProvider = options.provider
      if (options.language) script.dataset.geupddongMapLanguage = options.language
      script.src = options.src
      script.async = true
      document.head.append(script)
    }
  })
}

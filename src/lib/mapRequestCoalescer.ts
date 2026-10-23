// Mounted-map lifetime only: identical pending requests share work, but every
// completed request is forgotten. This does not cache public or private data.
export function createMapRequestCoalescer() {
  let active: { key: readonly unknown[]; controller: AbortController; promise: Promise<void> } | null = null
  return {
    run(key: readonly unknown[], operation: (signal: AbortSignal) => Promise<void>): Promise<void> {
      if (active && !active.controller.signal.aborted
        && key.length === active.key.length && key.every((value, index) => Object.is(value, active!.key[index]))) return active.promise
      active?.controller.abort()
      const controller = new AbortController()
      const entry = { key: [...key], controller, promise: Promise.resolve() }
      active = entry
      entry.promise = Promise.resolve().then(() => {
        if (!controller.signal.aborted) return operation(controller.signal)
      }).finally(() => { if (active === entry) active = null })
      return entry.promise
    },
    cancel() {
      const previous = active
      active = null
      previous?.controller.abort()
    },
  }
}

// SDK relayout can keep the top-left pixel rather than the geographic center.
export function relayoutPreservingCenter<T>(map: { relayout(): void; setCenter(center: T): void }, center: T) {
  map.relayout()
  map.setCenter(center)
}

// A delayed GPS answer must not win over a newer search, map reference or GPS request.
export function createReferenceRequestGate() {
  let revision = 0
  return {
    begin: () => ++revision,
    invalidate: () => { revision += 1 },
    isCurrent: (request: number) => request === revision,
  }
}

type TouchPoint = { identifier: number; clientX: number; clientY: number }
export function createCardHandleGesture() {
  let start: TouchPoint | null = null
  let ignoreClickUntil = 0
  return {
    start(touches: ArrayLike<TouchPoint>) {
      start = touches.length === 1 ? { identifier: touches[0].identifier, clientX: touches[0].clientX, clientY: touches[0].clientY } : null
    },
    move(touches: ArrayLike<TouchPoint>) { if (touches.length !== 1) start = null },
    cancel() { start = null },
    end(touches: ArrayLike<TouchPoint>, now = Date.now()) {
      const origin = start
      start = null
      const end = touches.length === 1 ? touches[0] : null
      if (!origin || !end || origin.identifier !== end.identifier) return false
      const dy = origin.clientY - end.clientY
      if (dy <= 36 || dy <= Math.abs(origin.clientX - end.clientX) * 2) return false
      ignoreClickUntil = now + 500
      return true
    },
    acceptsClick(now = Date.now()) { return now >= ignoreClickUntil },
  }
}

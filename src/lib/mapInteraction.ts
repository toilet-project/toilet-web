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
type MarkerPointer = { pointerId: number; clientX: number; clientY: number }
export function createMarkerTapGesture() {
  let start: MarkerPointer | null = null
  let startedAt = 0, accepted = false
  return {
    start(point: MarkerPointer, now = Date.now()) { start = { pointerId: point.pointerId, clientX: point.clientX, clientY: point.clientY }; startedAt = now; accepted = true },
    move(point: MarkerPointer) {
      if (start && point.pointerId === start.pointerId && Math.hypot(point.clientX - start.clientX, point.clientY - start.clientY) > 8) accepted = false
    },
    end(point: MarkerPointer, now = Date.now()) {
      if (!start || point.pointerId !== start.pointerId) return
      if (Math.hypot(point.clientX - start.clientX, point.clientY - start.clientY) > 8 || now - startedAt > 750) accepted = false
      start = null
    },
    cancel() { start = null; accepted = false },
    acceptsClick(detail: number) {
      if (detail === 0) return true // Enter/Space and assistive-technology activation.
      const result = accepted && start === null
      accepted = false
      return result
    },
  }
}

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

type VerticalBounds = { top: number; bottom: number }

/** Reveal the label too when it fits, but prioritise the editable box on short screens. */
export function reviewInputScrollDelta(body: VerticalBounds, input: VerticalBounds, labelTop: number) {
  const top = body.top + 12, bottom = body.bottom - 12
  if (bottom <= top) return 0
  const targetTop = input.bottom - labelTop <= bottom - top ? labelTop : input.top
  if (targetTop < top || input.bottom > bottom) return targetTop - top
  return 0
}

/** Review-only opt-in: scroll the card body, never scrollIntoView on the page/map. */
export function attachReviewInputVisibility(backdrop: HTMLElement) {
  const body = backdrop.querySelector<HTMLElement>('.rv-dialog-body')
  if (!body) return () => {}
  const viewport = window.visualViewport
  let frame = 0
  const sync = () => {
    window.cancelAnimationFrame(frame)
    frame = window.requestAnimationFrame(() => {
      // Respect accessibility pinch zoom; shared viewport layout has the same guard.
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return
      const input = document.activeElement
      if (!(input instanceof HTMLTextAreaElement) || !body.contains(input)) return
      const rect = input.getBoundingClientRect()
      const labelTop = input.closest('.rv-comment')?.getBoundingClientRect().top ?? rect.top
      const delta = reviewInputScrollDelta(body.getBoundingClientRect(), rect, labelTop)
      if (Math.abs(delta) > 1) body.scrollTop += delta
    })
  }
  // Registered after attachReportViewport: its new height is applied before measuring.
  viewport?.addEventListener('resize', sync)
  viewport?.addEventListener('scroll', sync)
  window.addEventListener('resize', sync)
  backdrop.addEventListener('focusin', sync)
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null
  observer?.observe(body)
  return () => {
    window.cancelAnimationFrame(frame)
    observer?.disconnect()
    viewport?.removeEventListener('resize', sync)
    viewport?.removeEventListener('scroll', sync)
    window.removeEventListener('resize', sync)
    backdrop.removeEventListener('focusin', sync)
  }
}

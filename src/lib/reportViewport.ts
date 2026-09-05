/** Lock only while a report is open; retain user zoom and restore original styles. */
export function attachReportViewport(backdrop: HTMLElement) {
  const body = document.body
  const root = document.documentElement
  const x = window.scrollX, y = window.scrollY
  const saved = ['position', 'top', 'left', 'width', 'overflow'].map(name => ({
    name, value: body.style.getPropertyValue(name), priority: body.style.getPropertyPriority(name),
  }))
  const rootOverflow = root.style.overflow
  const rootScrollBehavior = root.style.scrollBehavior
  body.style.position = 'fixed'
  body.style.top = `${-y}px`
  body.style.left = `${-x}px`
  body.style.width = '100%'
  body.style.overflow = 'hidden'
  root.style.overflow = 'hidden'
  root.style.scrollBehavior = 'auto'

  const viewport = window.visualViewport
  let frame = 0, restoreTimer = 0, keyboardWasOpen = false
  const restorePageOffset = () => {
    // The original page offset is represented by body's fixed top until cleanup.
    window.scrollTo(0, 0)
  }
  const sync = () => {
    window.cancelAnimationFrame(frame)
    frame = window.requestAnimationFrame(() => {
      // Do not counteract accessibility pinch zoom or force the page back to 1x.
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return
      const height = viewport?.height ?? window.innerHeight
      backdrop.style.setProperty('--report-viewport-height', `${height}px`)
      backdrop.style.setProperty('--report-viewport-top', `${viewport?.offsetTop ?? 0}px`)
      const keyboardOpen = height < window.innerHeight - 100
      if (keyboardWasOpen && !keyboardOpen) restorePageOffset()
      keyboardWasOpen = keyboardOpen
    })
  }
  const onFocusOut = () => {
    window.clearTimeout(restoreTimer)
    // Safari's keyboard dismissal completes after focusout. Don't restore while
    // the user is merely switching from one input to another.
    restoreTimer = window.setTimeout(() => {
      if (backdrop.contains(document.activeElement) && document.activeElement?.matches('input,textarea,[contenteditable="true"]')) return
      if (!viewport || Math.abs(viewport.scale - 1) <= 0.01) restorePageOffset()
      sync()
    }, 350)
  }
  viewport?.addEventListener('resize', sync)
  viewport?.addEventListener('scroll', sync)
  window.addEventListener('resize', sync)
  backdrop.addEventListener('focusout', onFocusOut)
  sync()
  return () => {
    window.cancelAnimationFrame(frame)
    window.clearTimeout(restoreTimer)
    viewport?.removeEventListener('resize', sync)
    viewport?.removeEventListener('scroll', sync)
    window.removeEventListener('resize', sync)
    backdrop.removeEventListener('focusout', onFocusOut)
    for (const { name, value, priority } of saved) {
      if (value) body.style.setProperty(name, value, priority)
      else body.style.removeProperty(name)
    }
    root.style.overflow = rootOverflow
    window.scrollTo(x, y)
    root.style.scrollBehavior = rootScrollBehavior
    backdrop.style.removeProperty('--report-viewport-height')
    backdrop.style.removeProperty('--report-viewport-top')
  }
}

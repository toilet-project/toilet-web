import { useEffect, useRef } from 'react'

/** Keep keyboard focus in a modal, and return it to its opener on close. */
export function useDialogFocus(enabled: boolean, onClose: () => void) {
  const dialog = useRef<HTMLElement | null>(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    if (!enabled || !dialog.current) return
    const element = dialog.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = () => Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')).filter(item => item.getClientRects().length > 0)
    ;(focusable()[0] ?? element).focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); return }
      if (event.key !== 'Tab') return
      const items = focusable(), first = items[0], last = items.at(-1)
      if (!first || !last) { event.preventDefault(); element.focus(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) { event.preventDefault(); first.focus() }
    }
    element.addEventListener('keydown', keydown)
    return () => { element.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus() }
  }, [enabled])
  return dialog
}

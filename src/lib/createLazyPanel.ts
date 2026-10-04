import { createElement, lazy, useMemo, useState, type ComponentType } from 'react'
import { LazyPanelFrame } from '../components/LazyPanel'

/** Recreate React.lazy on retry: a rejected lazy component caches its failure. */
export function createLazyPanel<Props extends object>(load: () => Promise<{ default: ComponentType<Props> }>, modal = true) {
  const initial = lazy(load)
  return function LazyPanel(props: Props) {
    const [attempt, setAttempt] = useState(0)
    const Panel = useMemo(() => attempt === 0 ? initial : lazy(load), [attempt])
    return createElement(LazyPanelFrame, {
      attempt, modal, onClose: (props as { onClose?: () => void }).onClose,
      onRetry: () => setAttempt(value => value + 1),
    }, createElement(Panel, props))
  }
}

export type AtlasPoint = { x: number; y: number }
export type AtlasViewport = AtlasPoint & { scale: number }
export const initialAtlasViewport: AtlasViewport = { x: 0, y: 0, scale: 1 }

export function constrainAtlas(view: AtlasViewport, width: number, height: number): AtlasViewport {
  const scale = Math.max(1, Math.min(8, view.scale))
  return { scale, x: Math.max(width * (1 - scale), Math.min(0, view.x)), y: Math.max(height * (1 - scale), Math.min(0, view.y)) }
}

// Keep the place under the cursor/pinch midpoint still while changing scale.
export function zoomAtlas(view: AtlasViewport, scale: number, origin: AtlasPoint, width: number, height: number, nextOrigin = origin): AtlasViewport {
  const ratio = Math.max(1, Math.min(8, scale)) / view.scale
  return constrainAtlas({ scale: view.scale * ratio, x: nextOrigin.x - (origin.x - view.x) * ratio, y: nextOrigin.y - (origin.y - view.y) * ratio }, width, height)
}

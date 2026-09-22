export type AtlasPoint = { x: number; y: number }
export type AtlasViewport = AtlasPoint & { scale: number }
export const initialAtlasViewport: AtlasViewport = { x: 0, y: 0, scale: 1 }

// Use the extra height of a phone for the mainland and Jeju, keeping the
// complete north/south extent inside the viewport with a little breathing room.
export function compactOverviewViewport(width: number, height: number, screenWidth: number, screenHeight: number): AtlasViewport {
  const fit = Math.min(screenWidth / width, screenHeight / height)
  const scale = Math.max(1, Math.min(1.65, (screenHeight - 40) / (height * fit)))
  return { scale, x: width * (1 - scale) / 2, y: height * (1 - scale) / 2 }
}

export function constrainAtlas(view: AtlasViewport, width: number, height: number): AtlasViewport {
  const scale = Math.max(1, Math.min(8, view.scale))
  return { scale, x: Math.max(width * (1 - scale), Math.min(0, view.x)), y: Math.max(height * (1 - scale), Math.min(0, view.y)) }
}

// Keep the place under the cursor/pinch midpoint still while changing scale.
export function zoomAtlas(view: AtlasViewport, scale: number, origin: AtlasPoint, width: number, height: number, nextOrigin = origin): AtlasViewport {
  const ratio = Math.max(1, Math.min(8, scale)) / view.scale
  return constrainAtlas({ scale: view.scale * ratio, x: nextOrigin.x - (origin.x - view.x) * ratio, y: nextOrigin.y - (origin.y - view.y) * ratio }, width, height)
}

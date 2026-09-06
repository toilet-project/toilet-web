type Bounds = { left: number; top: number; right: number; bottom: number }
type Point = { x: number; y: number }

// All values use map-section coordinates. Prefer avoiding the marker, then clamp.
export function cardPlacement(bounds: Bounds, point: Point, width: number, height: number, markerHeight = 34, gap = 18) {
  const centerY = point.y - markerHeight / 2
  const candidates = [
    { left: point.x - width / 2, top: point.y - height - gap },
    { left: point.x - width / 2, top: point.y + gap },
    { left: point.x + gap, top: centerY - height / 2 },
    { left: point.x - width - gap, top: centerY - height / 2 },
  ]
  const fits = (p: { left: number; top: number }) => p.left >= bounds.left && p.top >= bounds.top
    && p.left + width <= bounds.right && p.top + height <= bounds.bottom
  return candidates.find(fits) ?? {
    left: Math.max(bounds.left, Math.min(point.x - width / 2, bounds.right - width)),
    top: Math.max(bounds.top, Math.min(point.y + gap, bounds.bottom - height)),
  }
}

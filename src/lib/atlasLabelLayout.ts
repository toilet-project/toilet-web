type LabelInput = {
  code: string; x: number; y: number; width: number; height: number
  availableArea: number; regionWidth: number
  priority?: number
  alternatives?: { x: number; y: number }[]
}
export type AtlasLabel = LabelInput & { left: number; top: number }

export function placeAtlasLabels(inputs: LabelInput[], width: number, height: number, fitToRegion = true): AtlasLabel[] {
  const placed: AtlasLabel[] = []
  // Keep names at geographic anchors (or validated interior alternatives).
  // Zooming creates room for hidden names.
  // Every region remains accessible through the complete region picker.
  for (const input of [...inputs].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))) {
    if (fitToRegion && (input.availableArea < input.width * input.height || input.regionWidth < input.width * .75)) continue
    const gap = fitToRegion ? 8 : 3
    for (const anchor of [input, ...(input.alternatives ?? [])]) {
      const left = anchor.x - input.width / 2, top = anchor.y - input.height / 2
      if (left < 10 || left + input.width > width - 10 || top < 12 || top + input.height > height - 42) continue
      if (placed.some(p => left < p.left + p.width + gap && left + input.width > p.left - gap
        && top < p.top + p.height + gap && top + input.height > p.top - gap)) continue
      placed.push({ ...input, x: anchor.x, y: anchor.y, left, top })
      break
    }
  }
  return placed
}

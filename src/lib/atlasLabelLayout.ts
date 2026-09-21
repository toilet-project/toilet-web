type LabelInput = { code: string; x: number; y: number; width: number }
export type AtlasLabel = LabelInput & { left: number; top: number; height: number; callout: boolean }

export function placeAtlasLabels(inputs: LabelInput[], width: number, height: number): AtlasLabel[] {
  const placed: AtlasLabel[] = []
  // Dense areas get first choice; larger empty areas have room to shift their labels.
  const density = (p: LabelInput) => inputs.filter(q => Math.hypot(p.x - q.x, p.y - q.y) < 75).length
  const ordered = [...inputs].sort((a, b) => density(b) - density(a) || a.code.localeCompare(b.code))
  for (const input of ordered) {
    const labelHeight = 38, candidates: { left: number; top: number; cost: number }[] = []
    for (let radius = 0; radius <= 240; radius += 16) for (let step = 0; step < (radius ? 16 : 1); step++) {
      const angle = step * Math.PI / 8
      const left = Math.max(8, Math.min(width - input.width - 8, input.x + Math.cos(angle) * radius - input.width / 2))
      const top = Math.max(12, Math.min(height - labelHeight - 38, input.y + Math.sin(angle) * radius - labelHeight / 2))
      const overlap = placed.reduce((sum, p) => sum + Math.max(0, Math.min(left + input.width + 5, p.left + p.width + 5) - Math.max(left, p.left)) * Math.max(0, Math.min(top + labelHeight + 3, p.top + p.height + 3) - Math.max(top, p.top)), 0)
      const distance = Math.hypot(left + input.width / 2 - input.x, top + labelHeight / 2 - input.y)
      candidates.push({ left, top, cost: overlap * 1000 + distance })
    }
    const best = candidates.reduce((a, b) => a.cost <= b.cost ? a : b)
    placed.push({ ...input, ...best, height: labelHeight, callout: Math.hypot(best.left + input.width / 2 - input.x, best.top + labelHeight / 2 - input.y) > 24 })
  }
  return placed
}

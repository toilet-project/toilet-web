type LabelInput = {
  code: string; x: number; y: number; width: number; height: number
  availableArea: number; regionWidth: number
}
export type AtlasLabel = LabelInput & { left: number; top: number }

export function placeAtlasLabels(inputs: LabelInput[], width: number, height: number): AtlasLabel[] {
  const placed: AtlasLabel[] = []
  // Keep names at geographic anchors; zooming creates room for hidden names.
  // Every region remains accessible through the complete region picker.
  for (const input of inputs) {
    if (input.availableArea < input.width * input.height || input.regionWidth < input.width * .75) continue
    const left = input.x - input.width / 2, top = input.y - input.height / 2
    if (left < 10 || left + input.width > width - 10 || top < 12 || top + input.height > height - 42) continue
    if (placed.some(p => left < p.left + p.width + 8 && left + input.width > p.left - 8
      && top < p.top + p.height + 7 && top + input.height > p.top - 7)) continue
    placed.push({ ...input, left, top })
  }
  return placed
}

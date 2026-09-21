type Point = { latitude: number; longitude: number; count: number }

export function clusterRegionPoints<T extends Point>(points: T[], project: (point: T) => { x: number; y: number }, width: number, height: number, cellSize: number) {
  const cells = new Map<string, T[]>()
  points.forEach((point, index) => {
    const { x, y } = project(point)
    if (x < -64 || y < -64 || x > width + 64 || y > height + 64) return
    const key = cellSize > 0 ? `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}` : `${index}`
    const cell = cells.get(key)
    if (cell) cell.push(point)
    else cells.set(key, [point])
  })
  return [...cells.values()].map(items => {
    const count = items.reduce((sum, item) => sum + item.count, 0)
    return { items, count, latitude: items.reduce((sum, item) => sum + item.latitude * item.count, 0) / count,
      longitude: items.reduce((sum, item) => sum + item.longitude * item.count, 0) / count }
  })
}

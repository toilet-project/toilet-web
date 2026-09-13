export type CropOffset = { x: number; y: number }

export type CropGeometry = {
  drawWidth: number
  drawHeight: number
  drawX: number
  drawY: number
  sourceX: number
  sourceY: number
  sourceSize: number
}

export const MIN_PHOTO_ZOOM = 1
export const MAX_PHOTO_ZOOM = 3
export const PROFILE_PHOTO_CROP_SIZE = 512

export function clampPhotoZoom(value: number) {
  return Math.min(MAX_PHOTO_ZOOM, Math.max(MIN_PHOTO_ZOOM, value))
}

export function clampCropOffset(imageWidth: number, imageHeight: number, stageSize: number, zoom: number, offset: CropOffset): CropOffset {
  if (imageWidth <= 0 || imageHeight <= 0 || stageSize <= 0) return { x: 0, y: 0 }
  const safeZoom = clampPhotoZoom(zoom)
  const baseScale = Math.max(stageSize / imageWidth, stageSize / imageHeight)
  const maxX = Math.max(0, (imageWidth * baseScale * safeZoom - stageSize) / 2)
  const maxY = Math.max(0, (imageHeight * baseScale * safeZoom - stageSize) / 2)
  return {
    x: maxX === 0 ? 0 : Math.min(maxX, Math.max(-maxX, offset.x)),
    y: maxY === 0 ? 0 : Math.min(maxY, Math.max(-maxY, offset.y)),
  }
}

export function createCropGeometry(imageWidth: number, imageHeight: number, stageSize: number, zoom: number, offset: CropOffset): CropGeometry {
  if (imageWidth <= 0 || imageHeight <= 0 || stageSize <= 0) throw new Error('Invalid crop dimensions')
  const safeZoom = clampPhotoZoom(zoom)
  const safeOffset = clampCropOffset(imageWidth, imageHeight, stageSize, safeZoom, offset)
  const baseScale = Math.max(stageSize / imageWidth, stageSize / imageHeight)
  const displayScale = baseScale * safeZoom
  const drawWidth = imageWidth * displayScale
  const drawHeight = imageHeight * displayScale
  const drawX = (stageSize - drawWidth) / 2 + safeOffset.x
  const drawY = (stageSize - drawHeight) / 2 + safeOffset.y
  const sourceSize = stageSize / displayScale
  return {
    drawWidth,
    drawHeight,
    drawX,
    drawY,
    sourceX: drawX === 0 ? 0 : -drawX / displayScale,
    sourceY: drawY === 0 ? 0 : -drawY / displayScale,
    sourceSize,
  }
}

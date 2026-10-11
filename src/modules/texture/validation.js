import sharp from 'sharp'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const CAPE_DIMENSIONS = new Set(['64x32', '22x17', '46x22'])

function isSkinDimension(width, height) {
  return width >= 64
    && width % 64 === 0
    && (height === width || height * 2 === width)
}

function isTextureDimensionAllowed(width, height, kind) {
  if (kind === 'skin') return isSkinDimension(width, height)
  if (kind === 'cape') return CAPE_DIMENSIONS.has(`${width}x${height}`)
  return false
}

function hasUsablePixels(data, width, height) {
  const pixelCount = width * height
  let visiblePixels = 0
  let opaquePixels = 0
  for (let offset = 0; offset < pixelCount * 4; offset += 4) {
    const alpha = data[offset + 3]
    if (alpha >= 32) visiblePixels += 1
    if (alpha >= 200) opaquePixels += 1
  }

  const minimumVisiblePixels = Math.max(64, Math.ceil(pixelCount * 0.02))
  const minimumOpaquePixels = Math.max(32, Math.ceil(pixelCount * 0.01))
  return visiblePixels >= minimumVisiblePixels && opaquePixels >= minimumOpaquePixels
}

export async function validateTexturePng(buffer, kind) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) {
    return { ok: false, code: 'invalid_png' }
  }
  if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return { ok: false, code: 'invalid_png' }
  }
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') {
    return { ok: false, code: 'invalid_png' }
  }

  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  if (!isTextureDimensionAllowed(width, height, kind)) {
    return { ok: false, code: 'invalid_dimensions' }
  }

  try {
    const metadata = await sharp(buffer, { failOn: 'error' }).metadata()
    if (metadata.format !== 'png' || metadata.width !== width || metadata.height !== height) {
      return { ok: false, code: 'invalid_png' }
    }

    const decoded = await sharp(buffer, { failOn: 'error' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    if (decoded.info.width !== width || decoded.info.height !== height || decoded.info.channels < 4) {
      return { ok: false, code: 'invalid_png' }
    }
    if (!hasUsablePixels(decoded.data, width, height)) {
      return { ok: false, code: 'invalid_texture_quality' }
    }
  } catch {
    return { ok: false, code: 'invalid_png' }
  }

  return { ok: true, width, height }
}

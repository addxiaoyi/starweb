import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const AVATAR_SIZE = 512
const AVATAR_INPUT_PIXELS = 20_000_000
const MANAGED_AVATAR_PATH = /^\/uploads\/avatar-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i

export async function saveAvatar(file, uploadsDir) {
  if (!file?.buffer || !uploadsDir) return null
  const filename = `avatar-${crypto.randomUUID()}.webp`
  const destination = path.join(uploadsDir, filename)

  try {
    const image = sharp(file.buffer, { limitInputPixels: AVATAR_INPUT_PIXELS, failOn: 'error' })
    const metadata = await image.metadata()
    if (!['jpeg', 'png', 'webp', 'gif'].includes(metadata.format || '')) return null
    await image
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 86 })
      .toFile(destination)
    return `/uploads/${filename}`
  } catch {
    await fs.rm(destination, { force: true })
    return null
  }
}

export async function removeManagedAvatar(avatar, uploadsDir) {
  if (!uploadsDir || !MANAGED_AVATAR_PATH.test(String(avatar || ''))) return
  const filename = String(avatar).slice('/uploads/'.length)
  try {
    await fs.rm(path.join(uploadsDir, filename), { force: true })
  } catch (error) {
    console.warn(`[starmc-api] failed to remove replaced avatar ${filename}:`, error?.message || error)
  }
}

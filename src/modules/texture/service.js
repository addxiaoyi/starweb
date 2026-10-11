import path from 'node:path'
import { access, readFile, rename, writeFile as writeBytes } from 'node:fs/promises'
import sharp from 'sharp'
import { textureSubmissionStatus } from './policy.js'
import { validateTexturePng } from './validation.js'

function assetKey(kind, assetId) {
  return `${kind}_${assetId.replaceAll('-', '_')}`
}

function playerStateFor(store, userId) {
  if (!store.playerState || typeof store.playerState !== 'object') store.playerState = {}
  if (!store.playerState[userId]) store.playerState[userId] = { assets: {}, applied: {} }
  const state = store.playerState[userId]
  if (!state.assets || typeof state.assets !== 'object') state.assets = {}
  return state
}

async function normalizeMinecraftTexture(buffer, kind) {
  const width = kind === 'skin' ? 64 : 64
  const height = kind === 'skin' ? 64 : 32
  const image = sharp(buffer, { failOn: 'error' }).ensureAlpha()
  const metadata = await image.metadata()
  const sourceHeight = Number(metadata.height || 0)
  const resized = image.resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  if (kind === 'skin' && sourceHeight === 32) {
    return sharp({
      create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).composite([{ input: await resized.png().toBuffer(), top: 0, left: 0 }]).png().toBuffer()
  }
  return resized.png().toBuffer()
}

export function listUserTextureAssets(store, userId, profileId = '') {
  const state = store?.playerState?.[userId]
  const applied = (profileId && state?.appliedByProfile?.[profileId]) || state?.applied || {}
  const skinAssetId = String(applied.skinAssetId || '')
  const capeAssetId = String(applied.capeAssetId || '')
  return Object.values(state?.assets || {})
    .filter((asset) => asset && (asset.kind === 'skin' || asset.kind === 'cape'))
    .map((asset) => ({
      ...asset,
      equipped: asset.kind === 'skin' ? asset.id === skinAssetId : asset.id === capeAssetId,
    }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)))
}

export async function storeTextureUpload({
  store,
  user,
  kind,
  file,
  reviewEnabled,
  uploadsDir,
  randomUUID,
  writeFile,
}) {
  let normalized
  try {
    normalized = await normalizeMinecraftTexture(file?.buffer, kind)
  } catch {
    return { ok: false, code: 'invalid_png' }
  }
  const normalizedValidation = await validateTexturePng(normalized, kind)
  if (!normalizedValidation.ok) return normalizedValidation

  const assetId = randomUUID()
  const status = textureSubmissionStatus(user, reviewEnabled)
  const relativePath = path.posix.join('textures', String(user.id), `${kind}-${assetId}.png`)
  await writeFile(path.join(uploadsDir, relativePath), normalized)

  const asset = {
    id: assetId,
    kind,
    status,
    ownerId: user.id,
    ownerName: user.username || '',
    localPath: relativePath,
    url: `/uploads/${relativePath}`,
    width: normalizedValidation.width,
    height: normalizedValidation.height,
    createdAt: new Date().toISOString(),
  }
  const state = playerStateFor(store, user.id)
  state.assets[assetKey(kind, assetId)] = asset

  if (status === 'pending') {
    if (!Array.isArray(store.submissions)) store.submissions = []
    store.submissions.unshift({
      id: assetId,
      assetId,
      kind,
      userId: user.id,
      submitterUsername: user.username || '',
      localPath: relativePath,
      status,
      submittedAt: asset.createdAt,
      reviewVersion: 0,
    })
  }

  return { ok: true, asset }
}

function assetFile(uploadsDir, relativePath) {
  const root = path.resolve(uploadsDir)
  const file = path.resolve(root, String(relativePath || ''))
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return null
  return file
}

/** Re-encodes legacy local assets once at startup without changing their IDs. */
export async function migrateStoredTextureAssets({ store, uploadsDir }) {
  const assets = Object.values(store?.playerState || {})
    .flatMap((state) => Object.values(state?.assets || {}))
    .filter((asset) => asset && (asset.kind === 'skin' || asset.kind === 'cape') && asset.localPath)
  const summary = { scanned: assets.length, migrated: 0, skipped: 0, failed: 0 }

  for (const asset of assets) {
    const source = assetFile(uploadsDir, asset.localPath)
    if (!source) { asset.textureMigrationError = 'invalid_local_path'; summary.failed += 1; continue }
    try {
      await access(source)
      const input = await readFile(source)
      const normalized = await normalizeMinecraftTexture(input, asset.kind)
      const validation = await validateTexturePng(normalized, asset.kind)
      if (!validation.ok) {
        asset.textureMigrationError = validation.code
        summary.failed += 1
        continue
      }
      if (Buffer.compare(input, normalized) === 0 && asset.width === validation.width && asset.height === validation.height) {
        summary.skipped += 1
        continue
      }
      const temporary = `${source}.migrate-${process.pid}-${Date.now()}`
      await writeBytes(temporary, normalized)
      await rename(temporary, source)
      asset.width = validation.width
      asset.height = validation.height
      asset.textureMigratedAt = new Date().toISOString()
      delete asset.textureMigrationError
      summary.migrated += 1
    } catch (error) {
      asset.textureMigrationError = error?.code === 'ENOENT' ? 'file_not_found' : 'migration_failed'
      summary.failed += 1
    }
  }
  return summary
}

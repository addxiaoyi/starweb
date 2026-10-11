import multer from 'multer'
import path from 'node:path'
import crypto from 'node:crypto'
import { UPLOAD_DIR } from './persist.js'

const ALLOWED_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

export function createSkinUpload() {
  const storage = multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      // BUG FIX H-13: previously used Math.random() which is predictable and
      // can collide under load (race overwrites).  Use crypto.randomBytes
      // and strictly whitelist extensions to defend against path-traversal
      // and double-extension tricks (e.g. evil.png.php).
      const rawExt = path.extname(String(file.originalname || '')).toLowerCase()
      const ext = ALLOWED_IMAGE_EXTS.has(rawExt) ? rawExt : '.png'
      const safe = crypto.randomBytes(12).toString('base64url')
      cb(null, `skin-${Date.now()}-${safe}${ext}`)
    },
  })
  return multer({
    storage,
    limits: { fileSize: 512 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (/^image\//.test(file.mimetype) || file.originalname?.endsWith('.png')) cb(null, true)
      else cb(new Error('仅支持图片上传'))
    },
  })
}

export function createTextureUpload() {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 512 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (String(file.originalname || '').toLowerCase().endsWith('.png')) cb(null, true)
      else cb(new Error('仅支持 PNG 文件'))
    },
  })
}

export function createAvatarUpload() {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
  })
}

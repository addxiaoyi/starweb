import multer from 'multer'
import crypto from 'crypto'
import path from 'path'
import { UPLOAD_DIR } from './persist.js'

const ALLOWED = new Set(['image/png', 'image/jpeg'])
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg'])

function normalizedExtByMime(mime) {
  if (mime === 'image/png') return '.png'
  if (mime === 'image/jpeg') return '.jpg'
  return ''
}

function skinFileFilter(_req, file, cb) {
  const mime = String(file.mimetype || '').toLowerCase()
  const ext = path.extname(String(file.originalname || '')).toLowerCase()
  if (!ALLOWED.has(mime)) return cb(new Error('仅支持 PNG/JPEG 皮肤文件'))
  if (ext && !ALLOWED_EXT.has(ext)) return cb(new Error('文件扩展名与类型不匹配'))
  cb(null, true)
}

export function createSkinUpload() {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
      filename: (_req, file, cb) => {
        const ext = normalizedExtByMime(String(file.mimetype || '').toLowerCase()) || '.png'
        const safe = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`
        cb(null, safe)
      }
    }),
    limits: { fileSize: 4 * 1024 * 1024 },
    fileFilter: skinFileFilter
  })
}

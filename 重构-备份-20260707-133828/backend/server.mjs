/**
 * StarMC 本地开发后端：与前端约定的 /api 路由一致（见 重构/src/config、skin-station/api）。
 * 主服务默认 8787；插件桥 `/healthz`、`/plugin/skin/refresh` 同端口。开发环境前端经 Vite 代理访问。
 * @deprecated 联调统一入口已迁移至 `backend/src/server.js`，此文件仅保留兼容。
 */
import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import multer from 'multer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')

/** 默认 8787，避免与本机已占用的 8080 冲突；生产可与前端 `getApiBase` 一致设为 `PORT=8080` */
const API_PORT = Number(process.env.PORT ?? 8787)
const PLUGIN_SECRET = process.env.SKIN_BRIDGE_SECRET ?? ''
/** 返回给前端的静态资源根（经 Vite 代理时不能用浏览器 Host，否则 /uploads 无法访问） */
const PUBLIC_BASE =
  (process.env.PUBLIC_BASE_URL && String(process.env.PUBLIC_BASE_URL).replace(/\/$/, '')) ||
  `http://127.0.0.1:${API_PORT}` // 与当前 PORT 一致，供上传 URL 使用

function normalizeOrigin(origin) {
  return String(origin || '').trim().replace(/\/$/, '')
}

function readAllowedCorsOrigins() {
  const defaults = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173'
  ]
  const configured = String(process.env.CORS_ORIGIN || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean)
  const publicSiteOrigin = normalizeOrigin(process.env.PUBLIC_SITE_ORIGIN)
  if (publicSiteOrigin) configured.push(publicSiteOrigin)
  return new Set(configured.length ? configured : defaults)
}

const CORS_ALLOWED_ORIGINS = readAllowedCorsOrigins()
const corsOptions = {
  credentials: true,
  origin(origin, cb) {
    if (!origin) return cb(null, true)
    if (CORS_ALLOWED_ORIGINS.has(normalizeOrigin(origin))) return cb(null, true)
    return cb(null, false)
  }
}

function ensureDirs() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

function scryptHash(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex')
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex')
}

/** @type {Map<string, { id: string, token: string }>} */
const sessions = new Map()

/** @type {Map<string, User>} */
const usersById = new Map()

/** @type {Map<string, string>} username -> id */
const usersByName = new Map()

/**
 * @typedef {Object} Submission
 * @property {string} id
 * @property {string} fileName
 * @property {'pending'|'approved'|'rejected'} status
 * @property {string} submittedAt
 * @property {string} [reviewedAt]
 * @property {string} [note]
 * @property {'skin'|'cape'} kind
 */

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} uuid
 * @property {string} username
 * @property {string} [email]
 * @property {string} passwordHash
 * @property {string} salt
 * @property {Submission[]} submissions
 * @property {{ catalogId: string, title: string, slot: string, selectedAt: string }[]} recentSelections
 * @property {{ catalogId: string, title: string, slot: string, selectedAt: string } | null} activeSelection
 * @property {{ skinAssetId: number, capeAssetId: number, slot: string, version: number }} skinState
 */

const seedCatalog = () => [
  {
    id: 'official',
    title: '星辉默认套装',
    desc: '进服即可选用的官方风格皮肤',
    tag: '官方',
    cover: 'linear-gradient(145deg,#1e3a5f,#312e81)',
    model: 'default'
  },
  {
    id: 'event',
    title: '活动限定',
    desc: '节假日活动皮肤将在此展示',
    tag: '活动',
    cover: 'linear-gradient(145deg,#422006,#9a3412)',
    model: 'auto'
  },
  {
    id: 'community',
    title: '玩家精选',
    desc: '社区投稿审核通过后展示',
    tag: '社区',
    cover: 'linear-gradient(145deg,#14532d,#166534)',
    model: 'slim'
  },
  {
    id: 'pvp',
    title: 'PVP 轻薄款',
    desc: '低噪声贴图，适合对战场景',
    tag: 'PVP',
    cover: 'linear-gradient(145deg,#3b0764,#6b21a8)',
    model: 'slim'
  },
  {
    id: 'build',
    title: '建造者系列',
    desc: '偏写实工具人风格',
    tag: '建筑',
    cover: 'linear-gradient(145deg,#164e63,#0e7490)',
    model: 'default'
  },
  {
    id: 'more',
    title: '更多内容',
    desc: '后续从数据库同步',
    tag: '即将开放',
    cover: 'linear-gradient(145deg,#374151,#1f2937)',
    model: 'auto'
  }
]

let catalogItems = seedCatalog()
let catalogSyncedAt = new Date().toISOString()

let assetSeq = 1
function nextAssetId() {
  return assetSeq++
}

function catalogById(id) {
  return catalogItems.find((c) => c.id === id)
}

function authUser(req) {
  const h = req.headers.authorization || ''
  const m = /^Bearer\s+(.+)$/i.exec(h.trim())
  if (!m) return null
  const sess = sessions.get(m[1])
  if (!sess) return null
  return usersById.get(sess.id) || null
}

function requireUser(req, res) {
  const u = authUser(req)
  if (!u) {
    res.status(401).json({ message: '未授权', error: 'unauthorized' })
    return null
  }
  return u
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.bin'
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`)
  }
})
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } })

function assetPublicUrl(req, filename) {
  void req
  return `${PUBLIC_BASE}/uploads/${encodeURIComponent(filename)}`
}

function buildApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(cors(corsOptions))
  app.use(express.json({ limit: '2mb' }))
  app.use('/uploads', express.static(UPLOAD_DIR))

  app.get('/api/skins/catalog', (_req, res) => {
    const items = catalogItems.map((c) => ({
      ...c,
      skinTextureUrl: c.skinTextureUrl,
      capeTextureUrl: c.capeTextureUrl
    }))
    res.json({ items })
  })

  app.get('/api/skins/player/dashboard', (req, res) => {
    const u = requireUser(req, res)
    if (!u) return
    const pendingSubmissionCount = u.submissions.filter((s) => s.status === 'pending').length
    res.json({
      catalogSyncedAt,
      pendingSubmissionCount,
      activeSelection: u.activeSelection || undefined,
      recentSelections: u.recentSelections.length ? u.recentSelections : undefined
    })
  })

  app.get('/api/skins/player/submissions', (req, res) => {
    const u = requireUser(req, res)
    if (!u) return
    res.json({ items: u.submissions })
  })

  app.post('/api/skins/player/select', (req, res) => {
    const u = requireUser(req, res)
    if (!u) return
    const { catalogItemId, slot = 'default' } = req.body || {}
    if (!catalogItemId) {
      return res.status(400).json({ message: '缺少 catalogItemId' })
    }
    const item = catalogById(String(catalogItemId))
    if (!item) {
      return res.status(404).json({ message: '大厅项不存在' })
    }
    const selectedAt = new Date().toISOString()
    const row = {
      catalogId: item.id,
      title: item.title,
      slot: String(slot),
      selectedAt
    }
    u.activeSelection = row
    u.recentSelections.unshift({
      catalogId: row.catalogId,
      title: row.title,
      at: selectedAt
    })
    if (u.recentSelections.length > 20) u.recentSelections.length = 20
    res.json({ ok: true, message: '已选用' })
  })

  function handlePlayerSubmission(req, res, kind) {
    const u = requireUser(req, res)
    if (!u) return
    const file = req.file
    if (!file) return res.status(400).json({ message: '缺少文件' })
    const slot = String(req.body.slot || 'default')
    const id = crypto.randomUUID()
    const sub = {
      id,
      fileName: file.originalname || file.filename,
      status: /** @type {'pending'} */ ('pending'),
      submittedAt: new Date().toISOString(),
      kind
    }
    if (kind === 'skin') {
      sub.model = String(req.body.model || 'auto')
      sub.slot = slot
    } else {
      sub.slot = slot
    }
    u.submissions.unshift(sub)
    res.json({ ok: true, message: '已提交审核', id })
  }

  app.post(
    '/api/skins/player/submissions',
    upload.single('file'),
    (req, res) => {
      const type = String(req.body.type || '').toLowerCase()
      const kind = type === 'cape' ? 'cape' : 'skin'
      handlePlayerSubmission(req, res, kind)
    }
  )

  app.post(
    '/api/skins/player/submissions/cape',
    upload.single('file'),
    (req, res) => handlePlayerSubmission(req, res, 'cape')
  )

  app.post('/api/auth/register', (req, res) => {
    const { username, password, email } = req.body || {}
    const name = String(username || '').trim()
    if (!name || !password) {
      return res.status(400).json({ message: '用户名与密码必填', error: 'validation' })
    }
    if (usersByName.has(name)) {
      return res.status(409).json({ message: '用户名已存在', error: 'exists' })
    }
    const id = crypto.randomUUID()
    const salt = crypto.randomBytes(16).toString('hex')
    const passwordHash = scryptHash(String(password), salt)
    const uuid = crypto.randomUUID()
    /** @type {User} */
    const user = {
      id,
      uuid,
      username: name,
      email: email ? String(email).trim() : undefined,
      passwordHash,
      salt,
      submissions: [],
      recentSelections: [],
      activeSelection: null,
      skinState: {
        skinAssetId: 0,
        capeAssetId: 0,
        slot: 'default',
        version: 1
      }
    }
    usersById.set(id, user)
    usersByName.set(name, id)
    const token = randomToken()
    sessions.set(token, { id, token })
    res.json({
      token,
      user: { uuid, username: name, email: user.email }
    })
  })

  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {}
    const name = String(username || '').trim()
    const uid = usersByName.get(name)
    if (!uid) {
      return res.status(401).json({ message: '用户名或密码错误', error: 'auth' })
    }
    const user = usersById.get(uid)
    if (!user) return res.status(401).json({ message: '用户名或密码错误', error: 'auth' })
    const hash = scryptHash(String(password), user.salt)
    if (hash !== user.passwordHash) {
      return res.status(401).json({ message: '用户名或密码错误', error: 'auth' })
    }
    const token = randomToken()
    sessions.set(token, { id: user.id, token })
    res.json({
      token,
      user: {
        uuid: user.uuid,
        username: user.username,
        email: user.email
      }
    })
  })

  app.get('/api/user/me', (req, res) => {
    const u = requireUser(req, res)
    if (!u) return
    res.json({
      user: {
        uuid: u.uuid,
        username: u.username,
        email: u.email
      }
    })
  })

  app.get('/api/skin/current', (req, res) => {
    const u = requireUser(req, res)
    if (!u) return
    const q = String(req.query.uuid || '')
    if (q !== u.uuid) {
      return res.status(403).json({ message: 'uuid 与登录用户不一致' })
    }
    const etag = `"v${u.skinState.version}-${u.skinState.skinAssetId}-${u.skinState.capeAssetId}"`
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end()
    }
    res.setHeader('ETag', etag)
    res.json({
      uuid: u.uuid,
      skinAssetId: u.skinState.skinAssetId,
      capeAssetId: u.skinState.capeAssetId,
      slot: u.skinState.slot,
      version: u.skinState.version
    })
  })

  app.post('/api/skin/upload', upload.single('file'), (req, res) => {
    const u = requireUser(req, res)
    if (!u) return
    const file = req.file
    if (!file) return res.status(400).json({ message: '缺少文件' })
    if (String(req.body.uuid || '') !== u.uuid) {
      return res.status(403).json({ message: 'uuid 不匹配' })
    }
    const assetId = nextAssetId()
    const url = assetPublicUrl(req, file.filename)
    res.json({
      assetId,
      message: '上传成功',
      url
    })
  })

  app.post('/api/skin/upload-cape', upload.single('file'), (req, res) => {
    const u = requireUser(req, res)
    if (!u) return
    const file = req.file
    if (!file) return res.status(400).json({ message: '缺少文件' })
    if (String(req.body.uuid || '') !== u.uuid) {
      return res.status(403).json({ message: 'uuid 不匹配' })
    }
    const assetId = nextAssetId()
    const url = assetPublicUrl(req, file.filename)
    res.json({
      assetId,
      message: '上传成功',
      url
    })
  })

  app.post('/api/skin/apply', (req, res) => {
    const u = requireUser(req, res)
    if (!u) return
    const { uuid, skinAssetId, capeAssetId, slot } = req.body || {}
    if (String(uuid) !== u.uuid) {
      return res.status(403).json({ message: 'uuid 不匹配' })
    }
    u.skinState.skinAssetId = Number(skinAssetId) || 0
    u.skinState.capeAssetId = Number(capeAssetId) || 0
    u.skinState.slot = String(slot || 'default')
    u.skinState.version += 1
    res.json({ ok: true, message: '已应用', version: u.skinState.version })
  })

  app.get('/healthz', (_req, res) => {
    res.status(200).send('ok')
  })

  app.post('/plugin/skin/refresh', (req, res) => {
    if (PLUGIN_SECRET) {
      const s = req.headers['x-skinbridge-secret']
      if (s !== PLUGIN_SECRET) {
        return res.status(403).json({ message: '密钥无效' })
      }
    }
    const { uuid, version, reason } = req.body || {}
    console.log('[plugin/skin/refresh]', { uuid, version, reason })
    res.json({ ok: true, message: '已记录刷新请求（本地模拟）' })
  })

  app.use((err, _req, res, _next) => {
    console.error(err)
    res.status(500).json({ message: err.message || '服务器错误' })
  })

  return app
}

ensureDirs()
const mainApp = buildApp()

http.createServer(mainApp).listen(API_PORT, '0.0.0.0', () => {
  console.log(`[starmc-api] http://127.0.0.1:${API_PORT}（含 /healthz、/plugin/skin/refresh）`)
})

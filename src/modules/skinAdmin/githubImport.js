import crypto from 'node:crypto'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { validateTexturePng } from '../texture/validation.js'

const LICENSES = new Set(['MIT', 'Apache-2.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'CC0-1.0'])

function githubUrl(owner, repo, suffix = '') {
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${suffix}`
}

async function githubJson(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'starmc-skin-importer' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`GitHub API returned ${response.status}`)
  return response.json()
}

export async function importGithubSkin({ store, uploadsDir, owner, repo, filePath, name, type = 'steve' }) {
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) {
    return { ok: false, code: 'invalid_repository' }
  }
  if (!filePath || filePath.length > 300 || filePath.includes('..')) return { ok: false, code: 'invalid_path' }
  const repoInfo = await githubJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`)
  const license = String(repoInfo.license?.spdx_id || '').trim()
  if (!LICENSES.has(license)) return { ok: false, code: 'license_not_allowed', license: license || null }

  const content = await githubJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}`)
  if (content.type !== 'file' || !content.download_url) return { ok: false, code: 'texture_not_found' }
  const imageResponse = await fetch(content.download_url, { signal: AbortSignal.timeout(20_000) })
  if (!imageResponse.ok) return { ok: false, code: 'texture_download_failed' }
  const bytes = Buffer.from(await imageResponse.arrayBuffer())
  const validation = await validateTexturePng(bytes, 'skin')
  if (!validation.ok) return { ok: false, code: validation.code }
  const hash = crypto.createHash('sha256').update(bytes).digest('hex')
  const existing = (store.catalog || []).find((item) => item.contentHash === hash)
  if (existing) return { ok: false, code: 'duplicate_texture', item: existing }

  const relativePath = path.posix.join('textures', 'catalog', `gh_${hash.slice(0, 12)}.png`)
  await mkdir(path.join(uploadsDir, 'textures', 'catalog'), { recursive: true })
  await writeFile(path.join(uploadsDir, relativePath), bytes, { flag: 'wx' }).catch((error) => {
    if (error.code !== 'EEXIST') throw error
  })
  const now = new Date().toISOString()
  const item = {
    id: `gh_${hash.slice(0, 12)}`,
    name: String(name || path.basename(filePath, path.extname(filePath))).trim().slice(0, 120) || `GitHub ${hash.slice(0, 8)}`,
    type: type === 'alex' ? 'alex' : 'steve',
    creator: `${owner}/${repo}`,
    textureUrl: `/uploads/${relativePath}`,
    downloadUrl: `/uploads/${relativePath}`,
    contentHash: hash,
    source: 'open-source-authorized',
    license,
    sourceUrl: githubUrl(owner, repo, `/blob/${repoInfo.default_branch || 'main'}/${filePath}`),
    licenseUrl: githubUrl(owner, repo, `/blob/${repoInfo.default_branch || 'main'}/LICENSE`),
    reviewStatus: 'pending',
    public: false,
    published: false,
    visibility: 'private',
    createdAt: now,
  }
  if (!Array.isArray(store.catalog)) store.catalog = []
  store.catalog.push(item)
  return { ok: true, item }
}

import { seedWikiPages } from './content.js'

const WIKI_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
const MAX_WIKI_CONTENT_LENGTH = 200_000

export function normalizeWikiPage(page) {
  if (!page || typeof page !== 'object' || Array.isArray(page)) return null

  const id = String(page.id || '').trim()
  const title = String(page.title || '').trim()
  const titleEn = String(page.titleEn || '').trim()
  const category = String(page.category || '').trim()
  const content = [page.content, page.markdown, page.body]
    .find((value) => typeof value === 'string' && value.trim()) || ''

  if (!WIKI_ID_PATTERN.test(id) || !title || !category || !content.trim()) return null
  if (content.length > MAX_WIKI_CONTENT_LENGTH) return null

  return { id, title, titleEn, category, content }
}

function wikiError(message, code = 'validation_error') {
  return { ok: false, status: 400, message, code }
}

export function ensureWikiPages(store) {
  const current = Array.isArray(store.wikiPages) ? store.wikiPages : []
  const normalized = current.map(normalizeWikiPage).filter(Boolean)
  const needsSeed = store.wikiInitialized !== true && normalized.length === 0
  const pages = needsSeed ? seedWikiPages() : normalized
  const changed = JSON.stringify(current) !== JSON.stringify(pages) || store.wikiInitialized !== true

  if (changed) {
    store.wikiPages = pages
    store.wikiInitialized = true
  }
  return { pages, changed }
}

function publicPage(page) {
  return {
    id: page.id,
    title: page.title,
    titleEn: page.titleEn,
    category: page.category,
    content: page.content,
  }
}

export function createWikiPage(store, input) {
  const { pages, changed } = ensureWikiPages(store)
  const page = normalizeWikiPage(input)
  if (!page) return wikiError('文档编号、标题、分类和内容不能为空或格式不正确')
  if (pages.some((item) => item.id === page.id)) {
    return { ok: false, status: 409, message: '文档编号已存在', code: 'conflict' }
  }

  pages.push(page)
  store.wikiPages = pages
  store.wikiInitialized = true
  return { ok: true, page, seeded: changed }
}

export function updateWikiPage(store, id, input) {
  const { pages, changed } = ensureWikiPages(store)
  const index = pages.findIndex((item) => item.id === id)
  if (index < 0) return { ok: false, status: 404, message: '文档不存在', code: 'not_found' }

  const page = normalizeWikiPage({ ...pages[index], ...input, id })
  if (!page) return wikiError('文档编号、标题、分类和内容不能为空或格式不正确')

  pages[index] = page
  store.wikiPages = pages
  store.wikiInitialized = true
  return { ok: true, page, seeded: changed }
}

export function deleteWikiPage(store, id) {
  const { pages, changed } = ensureWikiPages(store)
  const index = pages.findIndex((item) => item.id === id)
  if (index < 0) return { ok: false, status: 404, message: '文档不存在', code: 'not_found' }

  const [page] = pages.splice(index, 1)
  store.wikiPages = pages
  store.wikiInitialized = true
  return { ok: true, page, seeded: changed }
}

export function registerWikiRoutes(app, deps) {
  const {
    getStore,
    requireUser,
    requireAdmin,
    jsonOk,
    jsonErr,
    scheduleSave,
    appendAuditLog,
  } = deps

  app.get('/api/wiki', (req, res) => {
    const store = getStore()
    const { pages, changed } = ensureWikiPages(store)
    if (changed) scheduleSave?.()
    return jsonOk(res, { data: pages.map(publicPage) })
  })

  app.post('/api/admin/wiki', requireUser, requireAdmin, (req, res) => {
    const store = getStore()
    const result = createWikiPage(store, req.body)
    if (!result.ok) return jsonErr(res, result.status, result.message, result.code)

    scheduleSave?.()
    appendAuditLog?.('wiki_page_created', { pageId: result.page.id, seeded: result.seeded }, req)
    return jsonOk(res, { data: publicPage(result.page) })
  })

  app.put('/api/admin/wiki/:id', requireUser, requireAdmin, (req, res) => {
    const id = String(req.params.id || '').trim()
    if (!WIKI_ID_PATTERN.test(id)) return jsonErr(res, 400, '文档编号无效', 'validation_error')

    const store = getStore()
    const result = updateWikiPage(store, id, req.body)
    if (!result.ok) return jsonErr(res, result.status, result.message, result.code)
    scheduleSave?.()
    appendAuditLog?.('wiki_page_updated', { pageId: id, seeded: result.seeded }, req)
    return jsonOk(res, { data: publicPage(result.page) })
  })

  app.delete('/api/admin/wiki/:id', requireUser, requireAdmin, (req, res) => {
    const id = String(req.params.id || '').trim()
    if (!WIKI_ID_PATTERN.test(id)) return jsonErr(res, 400, '文档编号无效', 'validation_error')

    const store = getStore()
    const result = deleteWikiPage(store, id)
    if (!result.ok) return jsonErr(res, result.status, result.message, result.code)

    scheduleSave?.()
    appendAuditLog?.('wiki_page_deleted', { pageId: id, seeded: result.seeded }, req)
    return jsonOk(res, { data: publicPage(result.page) })
  })
}

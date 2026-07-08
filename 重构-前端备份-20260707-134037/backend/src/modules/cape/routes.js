import { searchOpenverse, searchWikimedia } from './service.js'

export function registerCapeRoutes(app, deps = {}) {
  const jsonOk = deps.jsonOk || ((res, payload = {}, status = 200) => res.status(status).json({ ok: true, success: true, ...payload }))

  app.get('/api/cape/search', async (req, res, next) => {
    try {
      const q = String(req.query.q || '').trim()
      const page = Math.max(1, Number(req.query.page) || 1)
      const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 12))

      if (!q) {
        return jsonOk(res, { items: [], page, total: 0 })
      }

      const openverse = await searchOpenverse(q, page, limit).catch(() => null)
      if (openverse && openverse.items.length > 0) {
        return jsonOk(res, { items: openverse.items, page, total: openverse.total, source: 'openverse' })
      }

      const wikimedia = await searchWikimedia(q, page, limit).catch(() => null)
      if (wikimedia && wikimedia.items.length > 0) {
        return jsonOk(res, {
          items: wikimedia.items,
          page,
          total: wikimedia.total,
          source: 'wikimedia',
          warning: openverse ? undefined : 'Openverse 不可用，已切换 Wikimedia'
        })
      }

      return jsonOk(res, { items: [], page, total: 0, warning: '图片搜索暂时不可用' })
    } catch (error) {
      next(error)
    }
  })
}

import { sanitizeUins, fetchQqProfiles, buildQqProfilesFallback } from './service.js'

export function registerQqRoutes(app, deps = {}) {
  const jsonErr = deps.jsonErr || ((res, status, message) => res.status(status).json({ ok: false, message }))
  const jsonOk = deps.jsonOk || ((res, payload = {}, status = 200) => res.status(status).json({ ok: true, success: true, ...payload }))

  app.get('/api/qq/profiles', async (req, res, next) => {
    try {
      const uinsRaw = req.query.uins || ''
      const qqList = sanitizeUins(uinsRaw)
      if (qqList.length === 0) {
        res.setHeader('cache-control', 'no-store')
        return jsonErr(res, 400, '缺少有效的 QQ 号列表', 'validation_error', { profiles: {} })
      }

      try {
        const result = await fetchQqProfiles(qqList)
        res.setHeader('cache-control', 'no-store')
        return jsonOk(res, result)
      } catch (error) {
        const fallback = buildQqProfilesFallback(qqList, error instanceof Error ? error.message : 'QQ 资料拉取失败')
        res.setHeader('cache-control', 'no-store')
        return jsonOk(res, fallback)
      }
    } catch (error) {
      next(error)
    }
  })
}

export function registerMapHealthRoutes(app, { jsonErr }) {
  app.get('/api/ops/map-health', (_req, res) => jsonErr(res, 501, '地图健康检查未配置', 'not_configured'))
}

/**
 * 与 Vue Router 保持一致，供 vite-plugin-sitemap 的 dynamicRoutes 使用。
 * 构建时可设环境变量 VITE_SITE_ORIGIN（如 https://starmc.cn）以生成绝对 URL。
 */
export const STARMC_SITEMAP_HOSTNAME = `${(
  process.env.VITE_SITE_ORIGIN || 'https://starmc.cn'
).replace(/\/$/, '')}/`

export const STARMC_SITEMAP_ROUTES: string[] = [
  '/',
  '/guide',
  '/gem',
  '/map',
  '/video',
  '/ztjk',
  '/skin',
  '/skin/hall',
  '/skin/closet',
  '/skin/dashboard',
  '/profile',
  '/api-info',
  '/auth',
  '/terms',
  '/privacy',
  '/diagnostics',
]

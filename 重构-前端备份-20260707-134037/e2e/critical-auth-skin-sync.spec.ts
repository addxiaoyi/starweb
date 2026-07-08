import { test, expect } from '@playwright/test'

async function mockSession(page: Parameters<typeof test>[0]['page'], user = { uuid: '11111111-1111-1111-1111-111111111111', username: 'e2e-player', roles: ['user'] }) {
  await page.route('**/api/user/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user })
    })
  })
}

test('critical path: login -> skin operation -> sync -> logout', async ({ page }) => {
  await mockSession(page)
  await page.route('**/api/health', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  await page.route('**/api/telemetry', async (route) => {
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  await page.route('**/api/skins/tags/popular**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) })
  })
  await page.route('**/api/skins/catalog?sort=newest**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) })
  })

  await page.route('**/auth/signin', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/json',
        'st-access-token': 'mock-token-123'
      },
      body: JSON.stringify({ status: 'OK' })
    })
  })

  await page.route('**/api/user/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          uuid: '11111111-1111-1111-1111-111111111111',
          username: 'e2e-player',
          roles: ['user'],
          emailVerified: true,
          linkedMcUsername: 'E2EPlayer'
        }
      })
    })
  })

  await page.route('**/api/skin/catalog', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] })
    })
  })

  await page.route('**/api/skins/catalog**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] })
    })
  })

  await page.route('**/api/public/site-features', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reviewEntryEnabled: true })
    })
  })

  await page.route('**/api/skins/player/dashboard', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        emailVerified: true,
        linkedMcUsername: 'E2EPlayer',
        pendingSubmissionCount: 0,
        mojangSkinSyncEnabled: false,
        applied: {
          skinAssetId: 0,
          capeAssetId: 0,
          slot: 'default',
          version: 1
        },
        preview: {
          skinUrl: '/image/steve.png',
          model: 'default'
        }
      })
    })
  })

  await page.route('**/api/user/mc-account', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        name: 'E2EPlayer',
        uuid: '11111111-1111-1111-1111-111111111111'
      })
    })
  })

  await page.route('**/api/user/mc-profiles?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] })
    })
  })

  await page.route('**/api/user/mc-security-events?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] })
    })
  })

  await page.route('**/api/skins/library/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'lib-001',
            name: 'E2E Skin',
            model: 'default',
            source: 'server-db',
            updatedAt: '2026-04-10 10:00:00',
            previewUrl: '/image/steve.png',
            skinAssetId: 101,
            capeAssetId: 0,
            tags: ['e2e']
          }
        ]
      })
    })
  })

  await page.route('**/api/skin/apply', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: '应用成功（mock）' })
    })
  })

  await page.route('**/api/skins/library/sync**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: '同步完成（mock）' })
    })
  })

  await page.goto('/skin/manage')
  await page.evaluate(() => window.dispatchEvent(new Event('app-ready')))
  await page.waitForTimeout(600)

  // 登录态由 /api/user/me 恢复（session/cookie），不依赖前端表单动作
  await expect(page.getByText('资源管理')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.player-info .username')).toHaveText('e2e-player')

  await page.getByRole('link', { name: '皮肤库' }).click()
  await expect(page).toHaveURL(/\/skin\/library(\?|$)/)
  await expect(page.getByText('E2E Skin')).toBeVisible()
  await expect(page.getByText('已登录，可直接应用')).toBeVisible()

  const syncRespPromise = page.waitForResponse((resp) =>
    resp.url().includes('/api/skins/library/sync') && resp.request().method() === 'POST'
  )
  await page.getByRole('button', { name: '插件同步服务器库' }).click()
  const syncResp = await syncRespPromise
  expect(syncResp.ok(), `sync failed with status ${syncResp.status()}`).toBeTruthy()

  const applyButton = page.getByRole('button', { name: '应用到当前角色' }).first()
  await expect(applyButton).toBeEnabled()

  const applyRespPromise = page.waitForResponse((resp) =>
    resp.url().includes('/api/skin/apply') && resp.request().method() === 'POST'
  )
  await applyButton.click()
  const applyResp = await applyRespPromise
  expect(applyResp.ok(), `apply failed with status ${applyResp.status()}`).toBeTruthy()
  await expect(page).toHaveURL(/\/skin(\?|$)/)

  await page.goto('/skin/manage')
  await page.evaluate(() => window.dispatchEvent(new Event('app-ready')))
  await page.waitForTimeout(5500)
  await page.getByRole('button', { name: '退出登录' }).click()

  await expect(page.getByPlaceholder('Minecraft ID / 用户名')).toBeVisible()
})

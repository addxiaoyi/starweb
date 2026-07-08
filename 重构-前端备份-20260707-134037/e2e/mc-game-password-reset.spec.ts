import { test, expect } from '@playwright/test'

test('mc-game-password reset page basic flow UI', async ({ page }) => {
  await page.route('**/api/health', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  await page.goto('/mc-game-password-reset')
  await page.waitForTimeout(5500)

  await expect(page.getByRole('heading', { name: '重置游戏密码' })).toBeVisible()
  await expect(page.getByText('未登录也可通过邮箱验证码重置 Minecraft 进服密码。')).toBeVisible()

  // 1) request-code validation
  await page.getByRole('button', { name: '发送验证码' }).click()
  await expect(page.getByText('请至少填写邮箱或游戏角色名')).toBeVisible()

  // 2) confirm validation (bad code)
  await page.getByPlaceholder('MinecraftName').nth(1).fill('DemoPlayer')
  await page.getByPlaceholder('6位数字').fill('12')
  await page.getByPlaceholder('至少6位').fill('abc12345')
  await page.getByPlaceholder('再次输入新密码').fill('abc12345')
  await page.getByRole('button', { name: '确认重置' }).click()
  await expect(page.getByText('验证码需为 6 位数字')).toBeVisible()

  // 3) confirm validation (password mismatch)
  await page.getByPlaceholder('6位数字').fill('123456')
  await page.getByPlaceholder('再次输入新密码').fill('abc123456')
  await page.getByRole('button', { name: '确认重置' }).click()
  await expect(page.getByText('两次输入的新密码不一致')).toBeVisible()
})

test('auth page shows reset-password entry when not logged in', async ({ page }) => {
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
  await page.route('**/api/user/me', async (route) => {
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'unauthorized' }) })
  })
  await page.route('**/api/skins/catalog**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [] })
    })
  })

  await page.goto('/auth')
  await page.evaluate(() => window.dispatchEvent(new Event('app-ready')))
  await expect(page.getByRole('link', { name: '忘记游戏密码？使用邮箱验证码重置' })).toBeVisible({ timeout: 15000 })
})

test('mc-game-password server retry-after drives resend cooldown', async ({ page }) => {
  await page.route('**/api/health', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  await page.route('**/api/public/mc-game-password/request-code', async (route) => {
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      headers: { 'x-request-id': 'mock-req-429', 'retry-after': '17' },
      body: JSON.stringify({
        message: '请求过于频繁，请在 17 秒后重试',
        error: 'too_many_requests',
        code: 'too_many_requests',
        requestId: 'mock-req-429',
        retryAfterSec: 17
      })
    })
  })

  await page.goto('/mc-game-password-reset')
  await page.waitForTimeout(5500)

  await page.getByPlaceholder('you@example.com').fill('tester@example.com')
  await page.getByRole('button', { name: '发送验证码' }).click()
  await expect(page.getByText(/17 秒后重试/)).toBeVisible()
  await expect(page.getByRole('button', { name: /可重发 \(17s\)/ })).toBeDisabled()
})

test('mc-game-password happy path with mocked APIs and redirect countdown', async ({ page }) => {
  await page.route('**/api/health', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  await page.route('**/api/public/mc-game-password/request-code', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'x-request-id': 'mock-req-001' },
      body: JSON.stringify({ ok: true, message: '验证码已发送（mock）', requestId: 'mock-req-001' })
    })
  })

  await page.route('**/api/public/mc-game-password/confirm', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'x-request-id': 'mock-req-002' },
      body: JSON.stringify({ ok: true, message: '游戏密码已更新（mock）', requestId: 'mock-req-002' })
    })
  })

  await page.goto('/mc-game-password-reset')
  await page.waitForTimeout(5500)

  await page.getByPlaceholder('you@example.com').fill('tester@example.com')
  await page.getByRole('button', { name: '发送验证码' }).click()
  await expect(page.getByText('验证码已发送（mock）')).toBeVisible()
  await expect(page.getByText(/请求ID: mock-req-001/)).toBeVisible()
  await expect(page.getByRole('button', { name: /可重发/ })).toBeDisabled()

  await page.getByPlaceholder('MinecraftName').nth(1).fill('DemoPlayer')
  await page.getByPlaceholder('6位数字').fill('123456')
  await page.getByPlaceholder('至少6位').fill('Abc12345!')
  await page.getByRole('button', { name: '显示' }).first().click()
  await expect(page.getByRole('button', { name: '隐藏' }).first()).toBeVisible()
  await page.getByPlaceholder('再次输入新密码').fill('Abc12345!')
  await expect(page.getByText('包含大写字母')).toHaveClass(/ok/)
  await expect(page.getByText('包含小写字母')).toHaveClass(/ok/)
  await expect(page.getByText('包含数字')).toHaveClass(/ok/)
  await expect(page.getByText('两次输入一致')).toHaveClass(/ok/)
  await page.getByRole('button', { name: '确认重置' }).click()

  await expect(page.getByText('游戏密码已更新（mock）')).toBeVisible()
  await expect(page.getByText(/请求ID: mock-req-002/)).toBeVisible()
  await expect(page.getByText(/秒后自动跳转到皮肤站/)).toBeVisible()
})

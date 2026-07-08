import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const runA11yAudit = async (page: import('@playwright/test').Page, routeName: string) => {
  const results = await new AxeBuilder({ page })
    .exclude('[data-allow-a11y-violation="true"]')
    .analyze()

  const criticalViolations = results.violations.filter((v) => v.impact === 'critical')
  const nonCriticalViolations = results.violations.filter((v) => v.impact !== 'critical')

  if (nonCriticalViolations.length > 0) {
    const summary = nonCriticalViolations.map((v) => `${v.id}(${v.impact}) x${v.nodes.length}`).join(', ')
    console.warn(`[a11y][${routeName}] non-critical violations: ${summary}`)
  }

  expect(criticalViolations, `${routeName} should have no critical axe violations`).toEqual([])
}

test.describe('a11y baseline', () => {
  test('home page basic accessibility', async ({ page }) => {
    await page.route('**/api/health', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })
    await page.route('**/api/skins/tags/popular**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) })
    })
    await page.route('**/api/skins/catalog**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) })
    })
    await page.goto('/')
    await page.evaluate(() => window.dispatchEvent(new Event('app-ready')))
    await expect(page.getByRole('main')).toBeVisible()
    await runA11yAudit(page, 'home')
  })

  test('mc password reset page accessibility', async ({ page }) => {
    await page.route('**/api/health', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })
    await page.goto('/mc-game-password-reset')
    await page.evaluate(() => window.dispatchEvent(new Event('app-ready')))
    await expect(page.getByRole('heading', { name: /重置/i })).toBeVisible()
    await runA11yAudit(page, 'mc-game-password-reset')
  })

  test('security center unauth state accessibility', async ({ page }) => {
    await page.route('**/api/health', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })
    await page.goto('/security')
    await page.evaluate(() => window.dispatchEvent(new Event('app-ready')))
    await expect(page.getByText('请先登录后查看安全中心。')).toBeVisible()
    await runA11yAudit(page, 'security-unauth')
  })
})

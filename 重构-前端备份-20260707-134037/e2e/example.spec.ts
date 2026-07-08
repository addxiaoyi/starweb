import { test, expect } from '@playwright/test';

test('homepage has title and content', async ({ page }) => {
  await page.route('**/api/health', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  await page.route('**/api/skins/tags/popular**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) })
  })
  await page.route('**/api/skins/catalog**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) })
  })
  await page.goto('/');
  await page.evaluate(() => window.dispatchEvent(new Event('app-ready')))
  await page.waitForTimeout(5500);

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/StarMC/);

  // App uses splash screen on first paint; verify main content is mounted after it disappears.
  await expect(page.locator('#main-content')).toBeVisible();
});

test('api-info route loads developer api page', async ({ page }) => {
  await page.goto('/api-info');

  await expect(page.getByRole('heading', { name: '开发者 API' })).toBeVisible();
  await expect(page.getByText('接口范围')).toBeVisible();
  await expect(page.getByText('安全建议')).toBeVisible();
});

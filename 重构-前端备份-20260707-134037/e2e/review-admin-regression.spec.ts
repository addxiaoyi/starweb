import { test, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

type ReviewSubmission = {
  id: number
  authorId: number
  authorName: string
  title: string
  description: string
  tags: string[]
  skinFile: { url: string; size: number; filename: string }
  capeFile: { url: string; size: number; filename: string } | null
  status: 'pending' | 'approved' | 'rejected'
  submittedAt: string
}

type AuditEvent = {
  id: string
  reqId: string
  type: 'request_code' | 'confirm'
  ok: boolean
  reason?: string
  mcUsername?: string
  latencyMs?: number
  createdAt?: string
}

function parseCsv(content: string): string[][] {
  const text = content.replace(/^\uFEFF/, '').trim()
  if (!text) return []

  const rows: string[][] = []
  let currentRow: string[] = []
  let currentCell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        currentCell += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (ch === ',' && !inQuotes) {
      currentRow.push(currentCell)
      currentCell = ''
      continue
    }

    if (ch === '\n' && !inQuotes) {
      currentRow.push(currentCell)
      rows.push(currentRow)
      currentRow = []
      currentCell = ''
      continue
    }

    if (ch !== '\r') currentCell += ch
  }

  currentRow.push(currentCell)
  rows.push(currentRow)
  return rows
}

async function readDownloadText(download: { saveAs: (path: string) => Promise<void> }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'starmc-e2e-'))
  const file = path.join(dir, 'download.csv')
  await download.saveAs(file)
  return fs.readFile(file, 'utf-8')
}

async function mockSession(page: Parameters<typeof test>[0]['page'], user: { uuid: string; username: string; role?: string; roles?: string[] }) {
  await page.route('**/api/user/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user })
    })
  })
}

test.describe('E2E 回归：审核与诊断', () => {
  test.beforeEach(async ({ page }) => {
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

    await page.route('**/api/public/site-features', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ reviewEntryEnabled: true })
      })
    })

    await page.route('**/api/skins/catalog', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] })
      })
    })

    await page.route('**/api/skins/player/dashboard', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          pendingSubmissionCount: 0,
          activeTasks: 0,
          queueDepth: 0,
          failRate24h: 0,
          avgLatencyMs24h: 0,
          p95LatencyMs24h: 0,
          mojangSkinSyncEnabled: false,
          preview: { skinUrl: '/image/steve.png', model: 'default' }
        })
      })
    })

    await page.route('**/api/user/mc-account', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          name: 'MockPlayer',
          uuid: 'mock-player-uuid'
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
  })

  test('审核员全流程 + 失败重试后成功', async ({ page }) => {
    await mockSession(page, {
      uuid: 'u-reviewer',
      username: 'reviewer01',
      role: 'reviewer'
    })

    const submissions: ReviewSubmission[] = [
      {
        id: 1,
        title: '暮色斗篷',
        authorId: 101,
        authorName: 'Alex',
        description: '',
        tags: [],
        skinFile: { url: '/image/steve.png', size: 123, filename: 'steve.png' },
        capeFile: null,
        status: 'pending',
        submittedAt: '2026-04-07T12:30:00.000Z',
      }
    ]

    await page.route('**/api/submissions?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ records: submissions, total: submissions.length, page: 1, pageSize: 10 })
      })
    })

    let approveAttempt = 0
    await page.route('**/api/submissions/1/review', async (route) => {
      approveAttempt += 1
      if (approveAttempt < 3) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'mock temporary error' })
        })
        return
      }

      submissions.splice(0, submissions.length)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 1, status: 'approved', reviewedAt: new Date().toISOString(), reviewerId: 1, reviewerName: 'reviewer01' })
      })
    })

    page.on('dialog', async (dialog) => {
      await dialog.accept()
    })

    await page.goto('/skin/review')
    await page.evaluate(() => window.dispatchEvent(new Event('app-ready')))
    await page.waitForTimeout(5500)

    await expect(page).toHaveURL(/\/skin\/(review(\?mode=review-preview)?|\?mode=review-preview)/)
    await expect(page.getByText('当前模式：审核预览')).toBeVisible()
    await expect(page.locator('.review-panel')).toBeVisible()
    await expect(page.getByText('Alex')).toBeVisible()

    await page.getByText('暮色斗篷').click()
    await page.getByRole('button', { name: '通过' }).click()
    await page.getByRole('button', { name: '确认通过' }).click()

    await expect(page.getByText('暂无符合条件的记录')).toBeVisible()
    expect(approveAttempt).toBe(3)
  })

  test('越权拦截：普通用户访问审核路由被限制操作', async ({ page }) => {
    await mockSession(page, {
      uuid: 'u-player',
      username: 'player01',
      role: 'player'
    })

    await page.route('**/api/submissions?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          records: [
            {
              id: 2,
              authorId: 201,
              authorName: 'NoPerm',
              title: '未经授权稿件',
              description: '',
              tags: [],
              skinFile: { url: '/image/steve.png', size: 123, filename: 'steve.png' },
              capeFile: null,
              status: 'pending',
              submittedAt: '2026-04-07T12:31:00.000Z',
            }
          ],
          total: 1,
          page: 1,
          pageSize: 10
        })
      })
    })

    await page.goto('/skin/review')
    await page.evaluate(() => window.dispatchEvent(new Event('app-ready')))
    await page.waitForTimeout(5500)

    await expect(page).toHaveURL(/\/skin\/(review(\?mode=review-preview)?|\?mode=review-preview)/)
    await expect(page.getByText('当前模式：审核预览')).toBeVisible()
    await expect(page.locator('.review-panel')).toBeVisible()
    await page.getByText('未经授权稿件').click()
    await expect(page.getByText('你没有审核权限')).toBeVisible()
  })

  test('筛选与导出一致性：当前页与全量筛选导出结果一致', async ({ page }) => {
    const allEvents: AuditEvent[] = [
      {
        id: 'e1',
        reqId: 'req-1',
        type: 'request_code',
        ok: true,
        mcUsername: 'Alex',
        latencyMs: 120,
        createdAt: '2026-04-07T08:00:00.000Z'
      },
      {
        id: 'e2',
        reqId: 'req-2',
        type: 'confirm',
        ok: false,
        reason: 'invalid_code',
        mcUsername: 'Alex',
        latencyMs: 260,
        createdAt: '2026-04-07T08:01:00.000Z'
      },
      {
        id: 'e3',
        reqId: 'req-3',
        type: 'confirm',
        ok: false,
        reason: 'too_many_requests',
        mcUsername: 'Steve',
        latencyMs: 300,
        createdAt: '2026-04-07T08:02:00.000Z'
      },
      {
        id: 'e4',
        reqId: 'req-4',
        type: 'confirm',
        ok: true,
        mcUsername: 'Steve',
        latencyMs: 140,
        createdAt: '2026-04-07T08:03:00.000Z'
      }
    ]

    await page.route('**/api/admin/mc-reset/stats?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: 4,
          success: 2,
          failed: 2,
          successRate: 50,
          failRate: 50,
          latency: { p50: 200, p95: 300, p99: 300, max: 300 },
          reasons: [
            { reason: 'invalid_code', count: 1 },
            { reason: 'too_many_requests', count: 1 }
          ],
          trend: [],
          alerts: { failRateHigh: false, p95HighLatency: false }
        })
      })
    })

    await page.route('**/api/admin/mc-reset/events?**', async (route, request) => {
      const url = new URL(request.url())
      const ok = url.searchParams.get('ok')
      const type = url.searchParams.get('type')
      const limit = Number(url.searchParams.get('limit') || 50)
      const offset = Number(url.searchParams.get('offset') || 0)

      const filtered = allEvents.filter((ev) => {
        const okMatched = ok ? String(ev.ok) === ok : true
        const typeMatched = type ? ev.type === type : true
        return okMatched && typeMatched
      })

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: filtered.length,
          items: filtered.slice(offset, offset + limit)
        })
      })
    })

    await page.goto('/diagnostics')
    await page.evaluate(() => window.dispatchEvent(new Event('app-ready')))

    await page.getByPlaceholder('X-Admin-Secret').fill('admin-secret')
    await page.locator('label:has-text("状态筛选") select').selectOption('false')
    await page.locator('label:has-text("类型筛选") select').selectOption('confirm')

    await page.getByRole('button', { name: '刷新' }).click()

    await expect(page.getByText('共 2 条，当前第 1 / 1 页，显示 2 条')).toBeVisible()
    await expect(page.getByText('req-2')).toBeVisible()
    await expect(page.getByText('req-3')).toBeVisible()

    const currentPageDownloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出当前页 CSV' }).click()
    const currentPageDownload = await currentPageDownloadPromise
    const currentPageCsv = parseCsv(await readDownloadText(currentPageDownload))

    const filteredAllDownloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出筛选结果 CSV' }).click()
    const filteredAllDownload = await filteredAllDownloadPromise
    const filteredAllCsv = parseCsv(await readDownloadText(filteredAllDownload))

    const currentReqIds = currentPageCsv.slice(1).map((row) => row[3]).sort()
    const allReqIds = filteredAllCsv.slice(1).map((row) => row[3]).sort()

    expect(currentReqIds).toEqual(['req-2', 'req-3'])
    expect(allReqIds).toEqual(['req-2', 'req-3'])
  })

  test('筛选导出跨页一致性：当前页导出为子集，全量导出覆盖全部筛选结果', async ({ page }) => {
    const filteredConfirmFailedEvents: AuditEvent[] = Array.from({ length: 23 }, (_, idx) => {
      const n = idx + 1
      return {
        id: `p${n}`,
        reqId: `req-${100 + n}`,
        type: 'confirm',
        ok: false,
        reason: n % 2 === 0 ? 'invalid_code' : 'too_many_requests',
        mcUsername: n % 2 === 0 ? 'Alex' : 'Steve',
        latencyMs: 200 + n,
        createdAt: new Date(Date.UTC(2026, 3, 7, 9, idx, 0)).toISOString()
      }
    })

    await page.route('**/api/admin/mc-reset/stats?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: 23,
          success: 0,
          failed: 23,
          successRate: 0,
          failRate: 100,
          latency: { p50: 212, p95: 222, p99: 223, max: 223 },
          reasons: [
            { reason: 'invalid_code', count: 11 },
            { reason: 'too_many_requests', count: 12 }
          ],
          trend: [],
          alerts: { failRateHigh: true, p95HighLatency: false }
        })
      })
    })

    await page.route('**/api/admin/mc-reset/events?**', async (route, request) => {
      const url = new URL(request.url())
      const ok = url.searchParams.get('ok')
      const type = url.searchParams.get('type')
      const limit = Number(url.searchParams.get('limit') || 50)
      const offset = Number(url.searchParams.get('offset') || 0)

      const filtered = filteredConfirmFailedEvents.filter((ev) => {
        const okMatched = ok ? String(ev.ok) === ok : true
        const typeMatched = type ? ev.type === type : true
        return okMatched && typeMatched
      })

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: filtered.length,
          items: filtered.slice(offset, offset + limit)
        })
      })
    })

    await page.goto('/diagnostics?pageSize=20')
    await page.evaluate(() => window.dispatchEvent(new Event('app-ready')))

    await page.getByPlaceholder('X-Admin-Secret').fill('admin-secret')
    await page.locator('label:has-text("每页条数") select').selectOption('20')
    await page.locator('label:has-text("状态筛选") select').selectOption('false')
    await page.locator('label:has-text("类型筛选") select').selectOption('confirm')
    await page.getByRole('button', { name: '刷新' }).click()

    await expect(page.getByText('共 23 条，当前第 1 / 2 页，显示 20 条')).toBeVisible()
    await page.getByRole('button', { name: '下一页' }).click()
    await expect(page.getByText('共 23 条，当前第 2 / 2 页，显示 3 条')).toBeVisible()

    const currentPageDownloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出当前页 CSV' }).click()
    const currentPageDownload = await currentPageDownloadPromise
    const currentPageCsv = parseCsv(await readDownloadText(currentPageDownload))

    const filteredAllDownloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出筛选结果 CSV' }).click()
    const filteredAllDownload = await filteredAllDownloadPromise
    const filteredAllCsv = parseCsv(await readDownloadText(filteredAllDownload))

    const currentReqIds = currentPageCsv.slice(1).map((row) => row[3]).sort()
    const allReqIds = filteredAllCsv.slice(1).map((row) => row[3]).sort()

    expect(currentReqIds).toEqual(['req-121', 'req-122', 'req-123'])
    expect(allReqIds).toEqual(filteredConfirmFailedEvents.map((ev) => ev.reqId).sort())
  })
})

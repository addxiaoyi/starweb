import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildErrorBody,
  jsonError,
  jsonPage,
  normalizePagination,
  resolvePaginationQuery,
} from '../src/utils/response.js'

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    }
  }
}

test('buildErrorBody should return unified error shape', () => {
  const body = buildErrorBody('参数错误', 'validation_error', { field: 'email' })
  assert.deepEqual(body, {
    ok: false,
    success: false,
    message: '参数错误',
    code: 'validation_error',
    error: 'validation_error',
    details: { field: 'email' }
  })
})

test('normalizePagination should clamp invalid values', () => {
  const page = normalizePagination(-1, 99, 0)
  assert.equal(page.total, 0)
  assert.equal(page.page, 1)
  assert.equal(page.pageSize, 1)
  assert.equal(page.totalPages, 1)
  assert.equal(page.hasMore, false)
  assert.equal(page.hasPrev, false)
})

test('jsonError should send normalized payload', () => {
  const res = createRes()
  jsonError(res, 403, '无权限', 'forbidden')
  assert.equal(res.statusCode, 403)
  assert.deepEqual(res.body, {
    ok: false,
    success: false,
    message: '无权限',
    code: 'forbidden',
    error: 'forbidden'
  })
})

test('jsonPage should include pagination and legacy fields', () => {
  const res = createRes()
  jsonPage(
    res,
    {
      items: [{ id: 1 }, { id: 2 }],
      total: 12,
      page: 2,
      pageSize: 5,
      scope: 'reports'
    },
    206
  )

  assert.equal(res.statusCode, 206)
  assert.equal(res.body.ok, true)
  assert.equal(res.body.success, true)
  assert.equal(res.body.total, 12)
  assert.equal(res.body.page, 2)
  assert.equal(res.body.pageSize, 5)
  assert.equal(res.body.scope, 'reports')
  assert.deepEqual(res.body.pagination, {
    total: 12,
    page: 2,
    pageSize: 5,
    totalPages: 3,
    hasMore: true,
    hasPrev: true
  })
})

test('resolvePaginationQuery should prefer page/pageSize mode', () => {
  const result = resolvePaginationQuery(
    { page: '3', pageSize: '40', offset: '200', limit: '5' },
    { defaultPageSize: 10, maxPageSize: 50 }
  )
  assert.deepEqual(result, {
    mode: 'page',
    page: 3,
    pageSize: 40,
    offset: 80,
    limit: 40
  })
})

test('resolvePaginationQuery should support legacy offset/limit mode', () => {
  const result = resolvePaginationQuery(
    { offset: '30', limit: '15' },
    { defaultPageSize: 10, maxPageSize: 100 }
  )
  assert.deepEqual(result, {
    mode: 'offset',
    page: 3,
    pageSize: 15,
    offset: 30,
    limit: 15
  })
})

test('resolvePaginationQuery should apply defaults and bounds', () => {
  const result = resolvePaginationQuery(
    { pageSize: '999', page: '0' },
    { defaultPage: 2, defaultPageSize: 20, maxPageSize: 50 }
  )
  assert.deepEqual(result, {
    mode: 'page',
    page: 1,
    pageSize: 50,
    offset: 0,
    limit: 50
  })
})

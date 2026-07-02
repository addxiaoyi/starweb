import { describe, it, expect } from 'vitest'
import { bypassNonApiPaths } from '../../vite.proxy.config'

describe('bypassNonApiPaths', () => {
  it('does not intercept real API paths', () => {
    expect(bypassNonApiPaths({ url: '/api/v1/health' })).toBeUndefined()
    expect(bypassNonApiPaths({ url: '/api/foo?x=1' })).toBeUndefined()
  })

  it('serves SPA for /api-info style routes', () => {
    expect(bypassNonApiPaths({ url: '/api-info' })).toBe('/index.html')
    expect(bypassNonApiPaths({ url: '/api-foo' })).toBe('/index.html')
  })

  it('allows bare /api to reach proxy', () => {
    expect(bypassNonApiPaths({ url: '/api' })).toBeUndefined()
  })
})

import { describe, it, expect } from 'vitest'
import { securityService } from '@/services/SecurityService'

describe('SecurityService', () => {
  it('should be defined', () => {
    expect(securityService).toBeDefined()
  })

  it('should have getLogs method', () => {
    expect(typeof securityService.getLogs).toBe('function')
  })

  it('should have reportEvent method', () => {
    expect(typeof securityService.reportEvent).toBe('function')
  })

  it('should return logs queue', () => {
    const logs = securityService.getLogs()
    expect(Array.isArray(logs)).toBe(true)
  })

  it('should report events without throwing', () => {
    expect(() => securityService.reportEvent('CONTEXT_MENU', 'test')).not.toThrow()
  })
})

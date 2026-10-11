import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  attachGeoToAlerts,
  shouldRaiseHighRiskAlert,
} from '../../../../src/modules/security/service.js'

describe('security service geo helpers', () => {
  it('attachGeoToAlerts resolves unique IPs once per page', async () => {
    const calls = []
    const alerts = [
      { id: 'a1', payload: { ip: '1.2.3.4' } },
      { id: 'a2', payload: { ip: '1.2.3.4' } },
      { id: 'a3', payload: { ip: '5.6.7.8' } },
    ]
    await attachGeoToAlerts(alerts, async (ip) => {
      calls.push(ip)
      return ip === '1.2.3.4' ? 'CN' : 'US'
    })
    assert.deepStrictEqual(calls.sort(), ['1.2.3.4', '5.6.7.8'])
    assert.strictEqual(alerts[0].geo, 'CN')
    assert.strictEqual(alerts[1].geo, 'CN')
    assert.strictEqual(alerts[2].geo, 'US')
  })

  it('shouldRaiseHighRiskAlert suppresses duplicate high alerts within window', () => {
    const sc = {
      alerts: [
        {
          userId: 'u1',
          level: 'high',
          title: '检测到高风险登录行为',
          at: new Date().toISOString(),
        },
      ],
    }
    assert.strictEqual(shouldRaiseHighRiskAlert(sc, 'u1', '检测到高风险登录行为'), false)
    assert.strictEqual(shouldRaiseHighRiskAlert(sc, 'u2', '检测到高风险登录行为'), true)
  })
})

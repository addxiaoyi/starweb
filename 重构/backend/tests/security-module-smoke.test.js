import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  summarizeAlerts,
  buildTrendPoints,
  topAlertSources,
  markAlertReadById,
  markAllAlertsRead,
  revokeSessionById,
  revokeAllSessions
} from '../src/modules/security/service.js'

test('security summary/tops/trend service smoke', () => {
  const alerts = [
    { id: 'a1', userId: 'u1', level: 'high', read: false, at: new Date().toISOString(), payload: { ip: '1.1.1.1' }, geo: 'CN' },
    { id: 'a2', userId: 'u1', level: 'medium', read: true, at: new Date().toISOString(), payload: { ip: '1.1.1.1' }, geo: 'CN' },
    { id: 'a3', userId: 'u1', level: 'low', read: false, at: new Date().toISOString(), payload: { ip: '2.2.2.2' }, geo: 'US' }
  ]
  const sessions = [{ userId: 'u1', active: true }, { userId: 'u1', active: false }]
  const auditLogs = [{ userId: 'u1' }, { userId: 'u1' }]

  const summary = summarizeAlerts(alerts, sessions, auditLogs)
  assert.equal(summary.totals.alerts, 3)
  assert.equal(summary.totals.unread, 2)
  assert.equal(summary.byLevel.high, 1)

  const trend = buildTrendPoints(alerts, 7)
  assert.equal(trend.days, 7)
  assert.equal(Array.isArray(trend.points), true)

  const top = topAlertSources(alerts, 5)
  assert.equal(top.topIps[0].ip, '1.1.1.1')
  assert.equal(top.topGeos[0].geo, 'CN')
})

test('security read/revoke mutators smoke', () => {
  const sc = {
    alerts: [
      { id: 'a1', userId: 'u1', read: false },
      { id: 'a2', userId: 'u1', read: false },
      { id: 'a3', userId: 'u2', read: false }
    ],
    sessions: {
      s1: { id: 's1', userId: 'u1', active: true },
      s2: { id: 's2', userId: 'u1', active: true },
      s3: { id: 's3', userId: 'u2', active: true }
    }
  }

  const one = markAlertReadById(sc, 'u1', 'a1')
  assert.equal(one.ok, true)
  const all = markAllAlertsRead(sc, 'u1')
  assert.equal(all.count, 1)

  const revokeOne = revokeSessionById(sc, 'u1', 's1')
  assert.equal(revokeOne.ok, true)
  const revokeAll = revokeAllSessions(sc, 'u1')
  assert.equal(revokeAll.count, 1)
})

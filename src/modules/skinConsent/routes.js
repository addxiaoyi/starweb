function compactUuid(value) {
  return String(value || '').trim().replaceAll('-', '').toLowerCase()
}

function profileFor(user, uuid) {
  const wanted = compactUuid(uuid)
  if (!/^[0-9a-f]{32}$/.test(wanted)) return null
  const profiles = Array.isArray(user?.minecraftProfiles) ? user.minecraftProfiles : []
  return profiles.find((profile) => compactUuid(profile?.uuid) === wanted)
    || (compactUuid(user?.linkedMcUuid) === wanted ? {
      uuid: user.linkedMcUuid,
      username: user.linkedMcUsername,
    } : null)
}

function ensureConsents(store) {
  if (!store.playerSkinConsents || typeof store.playerSkinConsents !== 'object') {
    store.playerSkinConsents = {}
  }
  return store.playerSkinConsents
}

function consentKey(userId, uuid) {
  return `${userId}:${compactUuid(uuid)}`
}

function publicConsent(row) {
  return row ? {
    playerUuid: row.playerUuid,
    playerName: row.playerName,
    allowPublicSkin: row.allowPublicSkin === true,
    allowPublicCape: row.allowPublicCape === true,
    allowDownload: row.allowDownload === true,
    consentedAt: row.consentedAt || null,
    revokedAt: row.revokedAt || null,
  } : null
}

export function registerSkinConsentRoutes(app, deps) {
  const { requireUser, getStore, jsonOk, jsonErr, scheduleSave, appendAuditLog } = deps

  app.get('/api/user/skin-consent', requireUser, (req, res) => {
    const consents = ensureConsents(getStore())
    const profiles = Array.isArray(req.user.minecraftProfiles) ? req.user.minecraftProfiles : []
    const linked = profiles.length > 0 ? profiles : (req.user.linkedMcUuid ? [{
      uuid: req.user.linkedMcUuid,
      username: req.user.linkedMcUsername,
    }] : [])
    const items = linked.map((profile) => {
      const uuid = compactUuid(profile?.uuid)
      const consent = consents[consentKey(req.user.id, uuid)]
      return {
        playerUuid: uuid,
        playerName: String(profile?.username || '').trim(),
        consent: publicConsent(consent),
      }
    }).filter((item) => item.playerUuid && item.playerName)
    return jsonOk(res, { items })
  })

  app.post('/api/user/skin-consent', requireUser, (req, res) => {
    const playerUuid = compactUuid(req.body?.playerUuid)
    const profile = profileFor(req.user, playerUuid)
    if (!profile) return jsonErr(res, 403, '该游戏角色未绑定到当前网站账户', 'player_not_linked')
    const allowPublicSkin = req.body?.allowPublicSkin === true
    const allowPublicCape = req.body?.allowPublicCape === true
    const allowDownload = req.body?.allowDownload === true
    if (!allowPublicSkin && !allowPublicCape) {
      return jsonErr(res, 400, '至少选择公开皮肤或公开披风', 'consent_scope_empty')
    }
    const now = new Date().toISOString()
    const row = {
      userId: req.user.id,
      playerUuid,
      playerName: String(profile.username || '').trim(),
      allowPublicSkin,
      allowPublicCape,
      allowDownload,
      source: 'player-consent',
      consentVersion: 1,
      consentedAt: now,
      revokedAt: null,
    }
    ensureConsents(getStore())[consentKey(req.user.id, playerUuid)] = row
    scheduleSave()
    appendAuditLog?.('player_skin_consent_granted', {
      playerUuid, allowPublicSkin, allowPublicCape, allowDownload,
    }, req)
    return jsonOk(res, { consent: publicConsent(row) })
  })

  app.delete('/api/user/skin-consent/:playerUuid', requireUser, (req, res) => {
    const playerUuid = compactUuid(req.params.playerUuid)
    const key = consentKey(req.user.id, playerUuid)
    const consents = ensureConsents(getStore())
    const row = consents[key]
    if (!row) return jsonOk(res, { revoked: false })
    row.allowPublicSkin = false
    row.allowPublicCape = false
    row.allowDownload = false
    row.revokedAt = new Date().toISOString()
    scheduleSave()
    appendAuditLog?.('player_skin_consent_revoked', { playerUuid }, req)
    return jsonOk(res, { revoked: true })
  })
}

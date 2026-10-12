import assert from 'node:assert/strict'
import { test } from 'node:test'
import express from 'express'
import { registerPublicSkinProfileRoutes } from '../../../../src/modules/skin/routes.js'
import { registerSkinRefreshSubscriber } from '../../../../src/modules/event-bus/subscribers/skinRefreshSubscriber.js'
import { Events } from '../../../../src/modules/event-bus/events.js'

function setup({ user, archive = null, catalogItemById } = {}) {
  const store = { catalog: [], library: { version: 8 }, playerState: {}, dashboardConfigs: { pluginSkinSync: { playerArchive: archive || {} } } }
  const profileUser = user || {
    id: 'user-1', uuid: 'account-uuid', linkedMcUuid: '34be6c69-4d3a-3f40-a356-ff10e37bbdb1',
    linkedMcUsername: 'Alex', activeMinecraftUuid: '34be6c69-4d3a-3f40-a356-ff10e37bbdb1',
    minecraftProfiles: [{ uuid: '34be6c69-4d3a-3f40-a356-ff10e37bbdb1', username: 'Alex' }],
  }
  const app = express()
  registerPublicSkinProfileRoutes(app, {
    config: { publicApiBaseUrl: 'https://star-web.top' },
    getStore: () => store,
    jsonErr: (res, status, message, code) => res.status(status).json({ ok: false, message, code }),
    skinProfilePublicLimiter: (_req, _res, next) => next(),
    asyncHandler: (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next),
    findUserByLinkedMcUsername: (_store, name) => name.toLowerCase() === 'alex' ? profileUser : null,
    findUserByLinkedMcUuid: (_store, uuid) => {
      const wanted = uuid.replaceAll('-', '').toLowerCase()
      const profiles = [...(profileUser.minecraftProfiles || []), { uuid: profileUser.linkedMcUuid }, { uuid: profileUser.activeMinecraftUuid }]
      return profiles.some((profile) => String(profile?.uuid || '').replaceAll('-', '').toLowerCase() === wanted) ? profileUser : null
    },
    ensurePlayerState: (target, id) => target.playerState[id] ||= {
      activeSelection: null, recentSelections: [], assets: {},
      selectionByProfile: { '34be6c69-4d3a-3f40-a356-ff10e37bbdb1': { catalogId: 'picked', at: 'now' } },
      applied: { version: 12 },
      appliedByProfile: { '34be6c69-4d3a-3f40-a356-ff10e37bbdb1': { version: 12 } },
    },
    catalogItemById: catalogItemById || ((_store, id) => id === 'picked' ? { id, skinTextureUrl: 'https://textures.minecraft.net/texture/skin', capeTextureUrl: 'https://textures.minecraft.net/texture/cape', model: 'slim' } : null),
  })
  return app
}

async function request(app, path) {
  const server = app.listen(0)
  try {
    const address = server.address()
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`)
    return { response, body: await response.json() }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

test('UUID profile route resolves a bound UUID and returns stable skin version', async () => {
  const { response, body } = await request(setup(), '/api/public/skin-profile/34be6c69-4d3a-3f40-a356-ff10e37bbdb1.json')
  assert.equal(response.status, 200)
  assert.equal(body.id, '34be6c69-4d3a-3f40-a356-ff10e37bbdb1')
  assert.equal(body.name, 'Alex')
  assert.equal(body.version, '12')
  assert.equal(response.headers.get('cache-control'), 'public, max-age=30, stale-while-revalidate=120')
  assert.match(response.headers.get('etag'), /34be6c694d3a3f40a356ff10e37bbdb1-12/)
})


test('signs a selected official cape together with the website skin', async () => {
  const savedKey = process.env.MINESKIN_API_KEY
  const savedFetch = globalThis.fetch
  const skinHash = 'a'.repeat(64)
  const capeHash = 'b'.repeat(64)
  const skinUrl = `https://textures.minecraft.net/texture/${skinHash}`
  const capeUrl = `https://textures.minecraft.net/texture/${capeHash}`
  const signedValue = Buffer.from(JSON.stringify({
    timestamp: Date.now(),
    profileId: '34be6c694d3a3f40a356ff10e37bbdb1',
    profileName: 'Alex',
    textures: { SKIN: { url: skinUrl }, CAPE: { url: capeUrl } },
  })).toString('base64')
  const calls = []
  process.env.MINESKIN_API_KEY = 'test-key'
  globalThis.fetch = async (url, init = {}) => {
    if (!String(url).includes('api.mineskin.org')) return savedFetch(url, init)
    calls.push({ url: String(url), body: String(init.body || '') })
    if (String(url).endsWith('/v2/capes')) {
      return new Response(JSON.stringify({ capes: [{ uuid: 'cape-uuid', hash: capeHash, alias: 'Test Cape' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ skin: { texture: { value: signedValue, signature: 'signed-cape' } } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  try {
    const app = setup({
      catalogItemById: (_store, id) => id === 'picked'
        ? { id, skinTextureUrl: skinUrl, capeTextureUrl: capeUrl, model: 'slim' }
        : null,
    })
    const { response, body } = await request(app, '/api/public/skin-profile/34be6c69-4d3a-3f40-a356-ff10e37bbdb1.json')
    assert.equal(response.status, 200)
    assert.equal(body.textureError ?? null, null)
    assert.equal(body.textures.SKIN.signature, 'signed-cape')
    assert.ok(calls.some((call) => call.url.endsWith('/v2/skins') && call.body.includes('"cape":"cape-uuid"')))
  } finally {
    if (savedKey === undefined) delete process.env.MINESKIN_API_KEY
    else process.env.MINESKIN_API_KEY = savedKey
    globalThis.fetch = savedFetch
  }
})

test('UUID lookup does not fall through to a different username-linked account', async () => {
  const app = setup({ user: {
    id: 'wrong-user', linkedMcUuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', linkedMcUsername: 'Alex',
    minecraftProfiles: [{ uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', username: 'Alex' }],
  } })
  const { response, body } = await request(app, '/api/public/skin-profile/34be6c69-4d3a-3f40-a356-ff10e37bbdb1.json')
  assert.equal(response.status, 404)
  assert.equal(body.code, 'not_found')
})

test('UUID profile supports conditional requests without rebuilding a response body', async () => {
  const app = setup()
  await request(app, '/api/public/skin-profile/34be6c69-4d3a-3f40-a356-ff10e37bbdb1.json')
  const server = app.listen(0)
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/public/skin-profile/34be6c69-4d3a-3f40-a356-ff10e37bbdb1.json`, { headers: { 'If-None-Match': 'W/\"skin-34be6c694d3a3f40a356ff10e37bbdb1-12\"' } })
    assert.equal(response.status, 304)
  } finally { await new Promise((resolve) => server.close(resolve)) }
})

test('username profile endpoint remains compatible', async () => {
  const { response, body } = await request(setup(), '/api/public/skin-profile/Alex.json')
  assert.equal(response.status, 200)
  assert.equal(body.name, 'Alex')
  assert.equal(body.id, '34be6c69-4d3a-3f40-a356-ff10e37bbdb1')
})


test('skin refresh subscriber dispatches only the supplied UUID and selection version', async () => {
  const calls = []
  const eventBus = { handlers: new Map(), subscribe(event, handler) { this.handlers.set(event, handler) } }
  registerSkinRefreshSubscriber(eventBus, {
    pluginFetchJson: async (path, body) => { calls.push({ path, body }); return { status: 200, json: { ok: true } } },
  })
  await eventBus.handlers.get(Events.PLUGIN_SKIN_REFRESH_RECEIVED)({ body: {
    player_uuid: '34be6c69-4d3a-3f40-a356-ff10e37bbdb1', selection_version: 15,
  } })
  assert.deepEqual(calls, [{
    path: '/v1/admin/skin-refresh',
    body: { username: undefined, player_uuid: '34be6c69-4d3a-3f40-a356-ff10e37bbdb1', selection_version: 15, reason: 'skin_changed' },
  }])
})

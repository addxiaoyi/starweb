import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDefaultSkinProfile,
  buildSessionProfileFromMojangSnapshot,
  defaultSteveSkinUrl,
  mojangUuidInsertDashes,
  offlineProfileIdForName,
  parseTexturesFromSessionProfile
} from '../src/features/mojangSkin.js'

test('mojangUuidInsertDashes', () => {
  assert.equal(
    mojangUuidInsertDashes('069a79f444e94726a9befca2e91eef62'),
    '069a79f4-44e9-4726-a9be-fca2e91eef62'
  )
  assert.equal(mojangUuidInsertDashes('bad'), null)
})

test('parseTexturesFromSessionProfile decodes SKIN url', () => {
  const inner = {
    timestamp: 1,
    profileId: '069a79f444e94726a9befca2e91eef62',
    profileName: 'Notch',
    textures: {
      SKIN: { url: 'http://textures.minecraft.net/texture/x' }
    }
  }
  const value = Buffer.from(JSON.stringify(inner), 'utf8').toString('base64')
  const profile = {
    id: '069a79f444e94726a9befca2e91eef62',
    name: 'Notch',
    properties: [{ name: 'textures', value, signature: 'sig' }]
  }
  const p = parseTexturesFromSessionProfile(profile)
  assert.ok(p)
  assert.equal(p.skinUrl, 'http://textures.minecraft.net/texture/x')
  assert.equal(p.model, 'default')
  assert.equal(p.texturesSignature, 'sig')
})

test('parseTexturesFromSessionProfile slim metadata', () => {
  const inner = {
    textures: {
      SKIN: {
        url: 'http://textures.minecraft.net/texture/y',
        metadata: { model: 'slim' }
      }
    }
  }
  const value = Buffer.from(JSON.stringify(inner), 'utf8').toString('base64')
  const p = parseTexturesFromSessionProfile({
    properties: [{ name: 'textures', value }]
  })
  assert.ok(p)
  assert.equal(p.model, 'slim')
})

test('buildSessionProfileFromMojangSnapshot returns VLA compatible textures property', () => {
  const profile = buildSessionProfileFromMojangSnapshot(
    {
      mcUuidUndashed: '069a79f444e94726a9befca2e91eef62',
      canonicalName: 'Notch',
      texturesValue: 'base64-textures',
      texturesSignature: 'sig'
    },
    'notch'
  )
  assert.deepEqual(profile, {
    id: '069a79f444e94726a9befca2e91eef62',
    name: 'Notch',
    properties: [{ name: 'textures', value: 'base64-textures', signature: 'sig' }]
  })
})

test('buildDefaultSkinProfile returns parseable default skin textures', () => {
  const profile = buildDefaultSkinProfile('yuyuih')
  assert.ok(profile)
  assert.equal(profile.id, offlineProfileIdForName('yuyuih'))
  assert.equal(profile.name, 'yuyuih')
  const parsed = parseTexturesFromSessionProfile(profile)
  assert.ok(parsed)
  assert.equal(parsed.skinUrl, defaultSteveSkinUrl())
  assert.equal(parsed.model, 'default')
  assert.equal(parsed.texturesSignature, '')
})

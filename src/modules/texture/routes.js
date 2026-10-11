import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { listUserTextureAssets as listAssets, storeTextureUpload as storeUpload } from './service.js'
import { validateTexturePng } from './validation.js'
import { publicSiteConfig } from '../siteConfig/service.js'
import { buildNativeAiRequest, normalizeGeneratedTexture, readProviderImage, resolveAiEndpoint } from './aiProvider.js'

async function writeTextureFile(target, bytes) {
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, bytes)
}

const TEXTURE_PROMPTS = {
  skin: 'Convert the reference into a complete Minecraft Java skin UV atlas. Return only a transparent 64x64 PNG with every face aligned to the official modern skin layout. Preserve recognizable colors and clothing; do not add text, framing, shadows, or a rendered character view.',
  cape: 'Convert the reference into a Minecraft Java cape UV atlas. Return only a transparent 64x32 PNG. Place the main artwork on both 10x16 cape faces and derive coherent one-pixel edges. Do not add text, framing, shadows, or a rendered character view.',
}

export function registerTextureRoutes(app, deps) {
  const {
    requireUser,
    textureUpload,
    asyncHandler,
    getStore,
    jsonOk,
    jsonErr,
    storeTextureUpload = storeUpload,
    listUserTextureAssets = listAssets,
    uploadsDir,
    reviewEnabled = false,
    markPlayerStateDirty,
    markSubmissionDirty,
    scheduleSave,
    ensurePlayerState,
    triggerVlaSkinRefreshIfConfigured,
    writeTextureFile: writeAsset = writeTextureFile,
  } = deps

  app.post(
    '/api/textures/:kind(skin|cape)/upload',
    requireUser,
    textureUpload.single('file'),
    asyncHandler(async (req, res) => {
      if (!req.file) return jsonErr(res, 400, '缺少 PNG 文件', 'missing_file')
      const result = await storeTextureUpload({
        store: getStore(),
        user: req.user,
        kind: req.params.kind,
        file: req.file,
        reviewEnabled,
        uploadsDir,
        randomUUID: crypto.randomUUID,
        writeFile: writeAsset,
      })
      if (!result.ok) return jsonErr(res, 400, '纹理文件无效', result.code)

      markPlayerStateDirty?.(req.user.id)
      if (result.asset.status === 'pending') {
        markSubmissionDirty?.(result.asset.id)
      }
      scheduleSave?.()
      return jsonOk(res, { asset: result.asset })
    })
  )

  app.get('/api/textures/assets', requireUser, (req, res) => {
    const profileId = String(req.query?.profileId || '').trim()
    return jsonOk(res, { items: listUserTextureAssets(getStore(), req.user.id, profileId) })
  })

  app.post(
    '/api/textures/:kind(skin|cape)/:assetId/equip',
    requireUser,
    asyncHandler(async (req, res) => {
      const kind = req.params.kind
      const assetId = String(req.params.assetId || '').trim()
      const key = `${kind}_${assetId.replaceAll('-', '_')}`
      const store = getStore()
      const state = ensurePlayerState(store, req.user.id)
      const playerUuid = String(req.body?.playerUuid || '').trim()
      const user = store.users?.find((entry) => entry.id === req.user.id)
      const profiles = Array.isArray(user?.minecraftProfiles) ? user.minecraftProfiles : []
      const profile = profiles.find((entry) => String(entry?.uuid || '') === playerUuid)
      if (playerUuid && !profile) return jsonErr(res, 404, '绑定角色不存在', 'minecraft_profile_not_found')
      const asset = state.assets?.[key]
      if (!asset || asset.kind !== kind) return jsonErr(res, 404, '纹理资产不存在', 'not_found')
      if (asset.status !== 'approved') return jsonErr(res, 409, '纹理尚未通过审核', 'texture_not_approved')

      if (!state.applied) state.applied = {}
      if (!state.appliedByProfile) state.appliedByProfile = {}
      const applied = playerUuid
        ? (state.appliedByProfile[playerUuid] ||= {})
        : state.applied
      if (kind === 'skin') applied.skinAssetId = asset.id
      else applied.capeAssetId = asset.id
      applied.version = Number(applied.version || 0) + 1
      const activeUuid = String(user?.activeMinecraftUuid || user?.linkedMcUuid || '')
      if (!playerUuid || playerUuid === activeUuid) state.applied = { ...applied }
      markPlayerStateDirty?.(req.user.id)
      scheduleSave?.()
      triggerVlaSkinRefreshIfConfigured?.(profile?.username || req.user.linkedMcUsername)
      return jsonOk(res, { asset, applied, playerUuid: playerUuid || null })
    })
  )

  app.post(
    '/api/textures/:kind(skin|cape)/generate',
    requireUser,
    textureUpload.single('file'),
    asyncHandler(async (req, res) => {
      if (!req.file) return jsonErr(res, 400, '缺少参考图片', 'missing_file')
      const store = getStore()
      const kind = req.params.kind
      const config = publicSiteConfig(store)
      const endpoint = resolveAiEndpoint(config)
      if (!config.skinAiEnabled || !endpoint) return jsonErr(res, 503, 'AI 纹理服务尚未配置', 'ai_skin_not_configured')
      if (config.skinAiProtocol === 'gemini-native' && !process.env.GEMINI_API_KEY) return jsonErr(res, 503, 'Gemini API 密钥尚未配置', 'ai_provider_key_missing')
      if (config.skinAiProtocol === 'grok-native' && !process.env.XAI_API_KEY) return jsonErr(res, 503, 'xAI API 密钥尚未配置', 'ai_provider_key_missing')

      const user = store.users?.find((entry) => entry.id === req.user.id)
      if (!user) return jsonErr(res, 404, '用户不存在', 'user_not_found')
      const cost = config.skinAiCost
      if (Number(user.balance || 0) < cost) return jsonErr(res, 402, `余额不足，本次生成需要 ${cost.toFixed(1)} SC`, 'insufficient_balance')

      let request
      if (config.skinAiProtocol === 'gemini-native' || config.skinAiProtocol === 'grok-native') {
        request = buildNativeAiRequest({ config, kind, file: req.file, prompt: TEXTURE_PROMPTS[kind] })
      } else {
        const form = new FormData()
        form.append('image', new Blob([req.file.buffer], { type: req.file.mimetype || 'image/png' }), req.file.originalname || 'reference.png')
        form.append('kind', kind)
        form.append('prompt', TEXTURE_PROMPTS[kind])
        if (config.skinAiModel) form.append('model', config.skinAiModel)
        form.append('response_format', 'b64_json')
        form.append('output_width', '64')
        form.append('output_height', kind === 'skin' ? '64' : '32')
        const headers = {}
        if (process.env.SKIN_AI_API_KEY) headers.authorization = `Bearer ${process.env.SKIN_AI_API_KEY}`
        request = { url: endpoint, headers, body: form }
      }
      let response
      try {
        response = await fetch(request.url, { method: 'POST', headers: request.headers, body: request.body, signal: AbortSignal.timeout(120_000) })
      } catch (error) {
        console.error('[texture-ai] provider request failed', error)
        return jsonErr(res, 502, '无法连接 AI 纹理服务', 'generation_failed')
      }
      if (!response.ok) return jsonErr(res, 502, 'AI 皮肤服务生成失败', 'generation_failed')

      let bytes
      try {
        const generated = await readProviderImage(response, config.skinAiProtocol)
        bytes = await normalizeGeneratedTexture(generated, kind)
      } catch (error) {
        console.error('[texture-ai] invalid provider response', error)
        return jsonErr(res, 502, 'AI 服务返回了无法识别的图片数据', 'invalid_generated_texture')
      }
      const validation = await validateTexturePng(bytes, kind)
      if (!validation.ok) return jsonErr(res, 502, `AI 服务没有返回标准 Minecraft ${kind === 'skin' ? '皮肤' : '披风'}纹理`, 'invalid_generated_texture')

      user.balance = Math.round((Number(user.balance || 0) - cost) * 10) / 10
      scheduleSave?.()
      return jsonOk(res, { pngBase64: bytes.toString('base64'), kind, cost, balance: user.balance })
    })
  )
}

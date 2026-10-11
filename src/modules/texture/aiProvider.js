import sharp from 'sharp'

const OFFICIAL_ENDPOINTS = {
  'gemini-native': 'https://generativelanguage.googleapis.com/v1beta/models',
  'grok-native': 'https://api.x.ai/v1/images/edits',
}

const NAMING_PROMPT = `Inspect this Minecraft skin UV texture and return JSON only: {"name":"..."}. Use a concise Chinese name of 2-8 characters grounded in visible colors, clothing, creature traits, or theme. Do not infer identity, franchise, gender, rank, or story that is not visually evident.`

export function resolveAiEndpoint(config) {
  if (config.skinAiEndpoint) return config.skinAiEndpoint
  return OFFICIAL_ENDPOINTS[config.skinAiProtocol] || ''
}

export function buildNativeAiRequest({ config, kind, file, prompt }) {
  const protocol = config.skinAiProtocol
  const encoded = file.buffer.toString('base64')
  const mimeType = file.mimetype || 'image/png'

  if (protocol === 'gemini-native') {
    const model = config.skinAiModel || 'gemini-3.1-flash-image'
    const base = resolveAiEndpoint(config).replace(/\/$/, '')
    return {
      url: base.includes(':generateContent') ? base : `${base}/${encodeURIComponent(model)}:generateContent`,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY || '' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: encoded } }] }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          responseFormat: { image: { aspectRatio: kind === 'skin' ? '1:1' : '2:1' } },
        },
      }),
    }
  }

  const model = config.skinAiModel || 'grok-imagine-image-quality'
  return {
    url: resolveAiEndpoint(config),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.XAI_API_KEY || ''}` },
    body: JSON.stringify({
      model,
      prompt,
      image: { type: 'image_url', url: `data:${mimeType};base64,${encoded}` },
      aspect_ratio: kind === 'skin' ? '1:1' : '2:1',
      response_format: 'b64_json',
    }),
  }
}

export function buildSkinNamingRequest({ config, image }) {
  const encoded = image.toString('base64')
  const protocol = config.skinAiProtocol
  if (protocol === 'gemini-native') {
    const model = config.skinAiModel || 'gemini-2.5-flash'
    const base = resolveAiEndpoint(config).replace(/\/$/, '')
    return {
      url: base.includes(':generateContent') ? base : `${base}/${encodeURIComponent(model)}:generateContent`,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY || '' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: NAMING_PROMPT }, { inline_data: { mime_type: 'image/png', data: encoded } }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    }
  }

  const endpoint = protocol === 'grok-native'
    ? 'https://api.x.ai/v1/chat/completions'
    : config.skinAiEndpoint
  const apiKey = protocol === 'grok-native' ? process.env.XAI_API_KEY : process.env.SKIN_AI_API_KEY
  return {
    url: endpoint,
    headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({
      model: config.skinAiModel,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: [
        { type: 'text', text: NAMING_PROMPT },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${encoded}` } },
      ] }],
    }),
  }
}

export async function readProviderText(response, protocol) {
  const payload = await response.json()
  const content = protocol === 'gemini-native'
    ? payload?.candidates?.[0]?.content?.parts?.find((part) => typeof part?.text === 'string')?.text
    : payload?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new Error('AI response did not include a name')
  const parsed = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim())
  if (typeof parsed?.name !== 'string' || !parsed.name.trim()) throw new Error('AI response name is invalid')
  return parsed.name.trim()
}

export async function readProviderImage(response, protocol) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase()
  if (!contentType.includes('application/json')) return Buffer.from(await response.arrayBuffer())

  const payload = await response.json()
  const encoded = protocol === 'gemini-native'
    ? payload?.candidates?.[0]?.content?.parts?.find((part) => part?.inlineData?.data || part?.inline_data?.data)?.inlineData?.data
      || payload?.candidates?.[0]?.content?.parts?.find((part) => part?.inline_data?.data)?.inline_data?.data
    : payload?.data?.[0]?.b64_json || payload?.pngBase64 || payload?.image
  if (typeof encoded !== 'string' || encoded.length === 0) throw new Error('AI response did not include image bytes')
  return Buffer.from(encoded, 'base64')
}

function clearConnectedWhiteBackground(pixels, width, height) {
  const queue = []
  const seen = new Uint8Array(width * height)
  const enqueue = (x, y) => {
    const index = y * width + x
    if (seen[index]) return
    seen[index] = 1
    queue.push(index)
  }
  for (let x = 0; x < width; x += 1) { enqueue(x, 0); enqueue(x, height - 1) }
  for (let y = 0; y < height; y += 1) { enqueue(0, y); enqueue(width - 1, y) }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor]
    const offset = index * 4
    const isWhite = pixels[offset] >= 245 && pixels[offset + 1] >= 245 && pixels[offset + 2] >= 245
    if (!isWhite) continue
    pixels[offset + 3] = 0
    const x = index % width
    const y = Math.floor(index / width)
    if (x > 0) enqueue(x - 1, y)
    if (x + 1 < width) enqueue(x + 1, y)
    if (y > 0) enqueue(x, y - 1)
    if (y + 1 < height) enqueue(x, y + 1)
  }
}

export async function normalizeGeneratedTexture(bytes, kind) {
  const width = 64
  const height = kind === 'skin' ? 64 : 32
  const { data, info } = await sharp(bytes)
    .resize(width, height, { fit: 'fill', kernel: sharp.kernel.nearest })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  clearConnectedWhiteBackground(data, info.width, info.height)
  return sharp(data, { raw: info }).png().toBuffer()
}

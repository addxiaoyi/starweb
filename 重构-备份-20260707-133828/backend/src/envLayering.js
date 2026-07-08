import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.join(__dirname, '..')

export const GENERATED_ENV_PATH = path.join(backendRoot, '.env.generated')
export const MANUAL_ENV_PATH = path.join(backendRoot, '.env')

function envFileOverridesProcess(key) {
  return (
    key === 'NODE_ENV' ||
    key === 'PUBLIC_SITE_ORIGIN' ||
    key === 'CORS_ORIGIN' ||
    key.startsWith('CASDOOR_')
  )
}

export function resolveEnvLayerMode(raw = process.env.STARMC_ENV_LAYER_MODE) {
  const mode = String(raw || '').trim().toLowerCase()
  return mode === 'simple' ? 'simple' : 'overlay'
}

export function getEnvLayerFiles(mode = resolveEnvLayerMode()) {
  return mode === 'simple'
    ? [GENERATED_ENV_PATH]
    : [GENERATED_ENV_PATH, MANUAL_ENV_PATH]
}

export function parseEnvFile(envPath) {
  const out = {}
  if (!existsSync(envPath)) return out

  let raw
  try {
    raw = readFileSync(envPath, 'utf8')
  } catch {
    return out
  }

  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)

  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim()
    if (!s || s.startsWith('#')) continue
    const eq = s.indexOf('=')
    if (eq <= 0) continue

    const key = s.slice(0, eq).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue

    let val = s.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }

  return out
}

export function resolveProjectEnv({ mode = resolveEnvLayerMode(), processEnv = process.env } = {}) {
  const env = {}
  const sourceMap = {}
  const loadedFiles = []

  function applyFile(filePath, sourceName, overwriteGeneratedOnly = false) {
    if (!existsSync(filePath)) return
    const parsed = parseEnvFile(filePath)
    loadedFiles.push(filePath)

    for (const [key, val] of Object.entries(parsed)) {
      if (
        env[key] === undefined ||
        (!overwriteGeneratedOnly && sourceMap[key] === undefined) ||
        (overwriteGeneratedOnly && sourceMap[key] === 'generated')
      ) {
        env[key] = val
        sourceMap[key] = sourceName
      }
    }
  }

  applyFile(GENERATED_ENV_PATH, 'generated')
  if (mode === 'overlay') {
    applyFile(MANUAL_ENV_PATH, 'manual', true)
  }

  for (const [key, val] of Object.entries(processEnv || {})) {
    if (val === undefined) continue
    if (sourceMap[key] === 'manual' && envFileOverridesProcess(key)) continue
    env[key] = val
    sourceMap[key] = 'process'
  }

  return {
    env,
    mode,
    loadedFiles,
    sourceMap,
  }
}

export function applyProjectEnvToProcess(options) {
  const resolved = resolveProjectEnv(options)
  for (const [key, val] of Object.entries(resolved.env)) {
    if (val !== undefined) process.env[key] = val
  }
  return resolved
}

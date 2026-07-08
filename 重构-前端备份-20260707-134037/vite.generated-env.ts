import fs from 'node:fs'
import path from 'node:path'

function stripQuotes(value: string): string {
  const raw = value.trim()
  if (raw.length >= 2) {
    const first = raw[0]
    const last = raw[raw.length - 1]
    if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
      return raw
        .slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
    }
  }
  return raw
}

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {}
  }
  const out: Record<string, string> = {}
  const text = fs.readFileSync(filePath, 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }
    const idx = line.indexOf('=')
    if (idx <= 0) {
      continue
    }
    const key = line.slice(0, idx).trim()
    const value = stripQuotes(line.slice(idx + 1))
    if (key) {
      out[key] = value
    }
  }
  return out
}

export function applyStarMcGeneratedEnv(mode: string, rootDir: string): void {
  const files = [
    '.env.starmc.generated',
    `.env.starmc.${mode}.generated`,
    '.env',
    '.env.local',
    `.env.${mode}`,
    `.env.${mode}.local`,
  ]
  const merged: Record<string, string> = {}
  for (const fileName of files) {
    Object.assign(merged, parseEnvFile(path.join(rootDir, fileName)))
  }
  Object.assign(process.env, merged)
}

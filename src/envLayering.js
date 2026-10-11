import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = path.resolve(__dirname, '..')

function parseEnvFile(filePath) {
  const out = {}
  if (!fs.existsSync(filePath)) return out
  for (const raw of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key) out[key] = value
  }
  return out
}

export function applyProjectEnvToProcess({ mode = 'simple' } = {}) {
  const generated = path.join(backendRoot, '.env.generated')
  const overlay = path.join(backendRoot, '.env')
  const merged = { ...parseEnvFile(generated) }
  if (mode === 'overlay' && fs.existsSync(overlay)) {
    Object.assign(merged, parseEnvFile(overlay))
  }
  for (const [k, v] of Object.entries(merged)) {
    if (process.env[k] == null || process.env[k] === '') process.env[k] = v
  }
}

const runIdx = process.argv.indexOf('--run')
if (runIdx >= 0) {
  applyProjectEnvToProcess({ mode: 'simple' })
  const target = process.argv[runIdx + 1]
  const rest = process.argv.slice(runIdx + 2)
  const child = spawn(process.execPath, [path.resolve(backendRoot, target), ...rest], {
    stdio: 'inherit',
    env: process.env,
    cwd: backendRoot,
  })
  child.on('exit', (code) => process.exit(code ?? 1))
}

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('server uses the supported EmailPassword default export', async () => {
  const source = await readFile(new URL('../src/server.js', import.meta.url), 'utf8')

  const unsupportedNamedImport = /const\s*\{\s*EmailPassword\s*}\s*=\s*await import\(['"]supertokens-node\/recipe\/emailpassword['"]\)/
  const supportedDefaultImport = /import EmailPassword from ['"]supertokens-node\/recipe\/emailpassword['"]/

  assert.equal(unsupportedNamedImport.test(source), false)
  assert.equal(supportedDefaultImport.test(source), true)
})

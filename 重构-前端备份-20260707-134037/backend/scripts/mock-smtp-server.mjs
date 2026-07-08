/**
 * 本机开发用 SMTP Mock（无容器）：
 * - 支持 EHLO/HELO、AUTH PLAIN、AUTH LOGIN、NOOP、QUIT
 * - 用于 doctor:e2e-auth-mail-gate 的 SMTP verify 闭环
 */
import net from 'net'

const host = String(process.env.MOCK_SMTP_HOST || '127.0.0.1')
const port = Number(process.env.MOCK_SMTP_PORT || 2525)
const user = String(process.env.MOCK_SMTP_USER || 'dev_user')
const pass = String(process.env.MOCK_SMTP_PASS || 'dev_pass')

const expectedPlain = Buffer.from(`\u0000${user}\u0000${pass}`).toString('base64')
const b64User = Buffer.from(user).toString('base64')
const b64Pass = Buffer.from(pass).toString('base64')
const enableDebug = String(process.env.MOCK_SMTP_DEBUG || '').trim() === '1'

function debugLog(message) {
  if (enableDebug) {
    console.log(`[mock-smtp][debug] ${message}`)
  }
}

const server = net.createServer((socket) => {
  let buffer = ''
  let loginStep = 0

  socket.write('220 localhost ESMTP\r\n')

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8')
    while (buffer.includes('\n')) {
      const idx = buffer.indexOf('\n')
      const line = buffer.slice(0, idx).replace(/\r$/, '')
      buffer = buffer.slice(idx + 1)
      const upper = line.toUpperCase()
      debugLog(`C: ${line}`)

      if (loginStep === 1) {
        if (line.trim() === b64User) {
          loginStep = 2
          socket.write('334 UGFzc3dvcmQ6\r\n')
          debugLog('S: 334 Password')
        } else {
          loginStep = 0
          socket.write('535 5.7.8 Authentication credentials invalid\r\n')
          debugLog('S: 535 auth user failed')
        }
        continue
      }

      if (loginStep === 2) {
        if (line.trim() === b64Pass) {
          socket.write('235 2.7.0 Authentication successful\r\n')
          debugLog('S: 235 auth success')
        } else {
          socket.write('535 5.7.8 Authentication credentials invalid\r\n')
          debugLog('S: 535 auth pass failed')
        }
        loginStep = 0
        continue
      }

      if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
        socket.write('250-localhost\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 10485760\r\n')
        debugLog('S: 250 EHLO capabilities')
      } else if (upper.startsWith('AUTH PLAIN')) {
        const token = line.split(/\s+/)[2] || ''
        if (token === expectedPlain) {
          socket.write('235 2.7.0 Authentication successful\r\n')
          debugLog('S: 235 auth plain success')
        } else {
          socket.write('535 5.7.8 Authentication credentials invalid\r\n')
          debugLog('S: 535 auth plain failed')
        }
      } else if (upper.startsWith('AUTH LOGIN')) {
        loginStep = 1
        socket.write('334 VXNlcm5hbWU6\r\n')
        debugLog('S: 334 username')
      } else if (upper.startsWith('QUIT')) {
        socket.write('221 2.0.0 Bye\r\n')
        debugLog('S: 221 bye')
        socket.end()
      } else if (upper.startsWith('NOOP')) {
        socket.write('250 2.0.0 OK\r\n')
        debugLog('S: 250 noop')
      } else {
        socket.write('250 2.0.0 OK\r\n')
        debugLog('S: 250 generic')
      }
    }
  })

  socket.on('error', (err) => {
    debugLog(`socket error: ${err?.message || err}`)
  })
})

server.listen(port, host, () => {
  console.log(`[mock-smtp] listening on ${host}:${port}`)
})

const shutdown = () => {
  server.close(() => {
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

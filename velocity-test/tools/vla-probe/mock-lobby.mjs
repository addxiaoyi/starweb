import mc from 'minecraft-protocol'

const host = process.env.VLA_LOBBY_HOST || '127.0.0.1'
const port = Number(process.env.VLA_LOBBY_PORT || 30066)
const version = process.env.VLA_MC_VERSION || '1.20.4'

const server = mc.createServer({
  host,
  port,
  'online-mode': false,
  version,
  motd: 'VLA mock lobby'
})

server.on('login', (client) => {
  console.log(`[mock-lobby] login ${client.username}`)
  client.write('login', {
    entityId: 1,
    isHardcore: false,
    gameMode: 0,
    previousGameMode: 255,
    worldNames: ['minecraft:overworld'],
    dimensionCodec: mc.registry?.[version]?.loginPacket?.dimensionCodec,
    dimension: mc.registry?.[version]?.loginPacket?.dimension,
    worldName: 'minecraft:overworld',
    hashedSeed: [0, 0],
    maxPlayers: 100,
    viewDistance: 8,
    simulationDistance: 8,
    reducedDebugInfo: false,
    enableRespawnScreen: true,
    isDebug: false,
    isFlat: false,
    death: undefined,
    portalCooldown: 0
  })
})

server.on('error', (err) => {
  console.error(`[mock-lobby] error ${err?.stack || err}`)
})

console.log(`[mock-lobby] listening ${host}:${port} version=${version}`)

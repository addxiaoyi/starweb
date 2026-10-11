const PLAYER_CREATION_WEIGHT = 4

function isPlayerCreation(skin) {
  return skin?.source === 'submission'
    || Boolean(skin?.submissionId)
    || String(skin?.id || '').startsWith('sub_')
}

export function chooseFeaturedSkins(skins, limit, random = Math.random) {
  const remaining = skins.slice()
  const chosen = []
  const count = Math.min(Math.max(0, Number(limit) || 0), remaining.length)

  while (chosen.length < count) {
    const weight = remaining.reduce((sum, skin) => sum + (isPlayerCreation(skin) ? PLAYER_CREATION_WEIGHT : 1), 0)
    let cursor = random() * weight
    let index = remaining.length - 1
    for (let current = 0; current < remaining.length; current += 1) {
      cursor -= isPlayerCreation(remaining[current]) ? PLAYER_CREATION_WEIGHT : 1
      if (cursor < 0) {
        index = current
        break
      }
    }
    chosen.push(remaining.splice(index, 1)[0])
  }

  return chosen
}

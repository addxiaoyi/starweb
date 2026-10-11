export async function fetchMojangSkinSnapshot(username) {
  const name = String(username || '').trim()
  if (!name) return { ok: false, error: 'validation_error' }
  try {
    const profileRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`)
    if (!profileRes.ok) return { ok: false, error: 'not_found', status: profileRes.status }
    const profile = await profileRes.json()
    return {
      ok: true,
      username: profile.name,
      uuid: profile.id,
      textureUrl: `https://crafatar.com/skins/${profile.id}`,
    }
  } catch (e) {
    return { ok: false, error: 'upstream_error', detail: String(e?.message || e) }
  }
}

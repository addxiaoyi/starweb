/** @type {WeakMap<object, Set<import('http').ServerResponse>>} */
const storeSseWriters = new WeakMap()

export function attachSkinLibrarySseClient(store, res) {
  let writers = storeSseWriters.get(store)
  if (!writers) {
    writers = new Set()
    storeSseWriters.set(store, writers)
  }
  writers.add(res)
  store.skinLibrarySseClients = Number(store.skinLibrarySseClients || 0) + 1
}

export function detachSkinLibrarySseClient(store, res) {
  const writers = storeSseWriters.get(store)
  if (writers) writers.delete(res)
  store.skinLibrarySseClients = Math.max(0, Number(store.skinLibrarySseClients || 1) - 1)
}

export function bumpCatalogLibraryVersion(store) {
  if (!store.library || typeof store.library !== 'object') store.library = {}
  store.library.version = Number(store.library.version || 1) + 1
  store.library.syncedAt = new Date().toISOString()
  return store.library.version
}

export function broadcastCatalogSync(store, extra = {}) {
  const payload = {
    version: store.library?.version || 1,
    syncedAt: store.library?.syncedAt || null,
    totalItems: Array.isArray(store.catalog) ? store.catalog.length : 0,
    ...extra,
  }
  const writers = storeSseWriters.get(store)
  if (writers && writers.size > 0) {
    const chunk = `event: catalog_sync\ndata: ${JSON.stringify(payload)}\n\n`
    for (const res of writers) {
      try {
        res.write(chunk)
      } catch {
        writers.delete(res)
      }
    }
  }
  return payload
}

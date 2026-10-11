self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.registration.unregister()
    const pages = await self.clients.matchAll({ type: 'window' })
    await Promise.all(pages.map((page) => page.navigate(page.url)))
  })())
})

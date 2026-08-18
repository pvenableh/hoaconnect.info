/* HOA Connect service worker — web push, notification clicks, app-icon badge.
 * Plain JS, no build step, served from the layer's public/ at root scope.
 *
 * Deliberately has NO fetch handler and caches no app assets: offline support is
 * not what this is for, and an asset cache here would fight the versioning
 * system (a stale cached bundle would shadow a fresh deploy). The only Cache
 * Storage it touches is one entry holding the badge count. */

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      // Drop ALL Cache Storage except the badge store on every activate, so an
      // earlier (or future stray) service worker that DID cache assets can never
      // leave a returning device pinned to a dead build.
      try {
        const keys = await caches.keys()
        await Promise.all(keys.filter((k) => k !== BADGE_CACHE).map((k) => caches.delete(k)))
      } catch (e) {
        /* storage refused — nothing to clean */
      }
      await self.clients.claim()
    })(),
  ),
)

/* ── App-icon badge ──────────────────────────────────────────────────────────
 * The badge on an installed icon has to be set from HERE: a push usually
 * arrives with no page open, so page-side syncing can only ever correct a
 * badge, never raise one.
 *
 * The count is persisted in Cache Storage (one synthetic Response holding a
 * number) because the worker is killed between pushes and nothing else
 * survives. An open page is always the authority — it posts the true unread
 * count over postMessage, which overwrites whatever we counted here. */
const BADGE_CACHE = 'hoa-badge'
const BADGE_KEY = '/__badge'

async function readBadge() {
  try {
    const cache = await caches.open(BADGE_CACHE)
    const res = await cache.match(BADGE_KEY)
    if (!res) return 0
    const n = Number(await res.text())
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch (e) {
    return 0
  }
}

async function writeBadge(n) {
  try {
    const cache = await caches.open(BADGE_CACHE)
    await cache.put(BADGE_KEY, new Response(String(n)))
  } catch (e) {
    /* storage refused — the OS badge below is still applied for this session */
  }
}

/** Push the number at the OS. No-op where the Badging API isn't supported. */
function applyBadge(n) {
  const nav = self.navigator
  if (!nav || typeof nav.setAppBadge !== 'function') return
  if (n > 0) nav.setAppBadge(n).catch(() => {})
  else if (typeof nav.clearAppBadge === 'function') nav.clearAppBadge().catch(() => {})
}

/** Absolute set — the server told us the count, or an open page synced it. */
async function setBadge(n) {
  const v = Math.max(0, Math.floor(Number(n) || 0))
  await writeBadge(v)
  applyBadge(v)
}

/** Relative bump, for pushes that don't carry a count. */
async function bumpBadge(delta) {
  const v = Math.max(0, (await readBadge()) + delta)
  await writeBadge(v)
  applyBadge(v)
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: 'HOA Connect', body: event.data ? event.data.text() : '' }
  }
  // Notifications are org-scoped: a member can belong to several communities, so
  // the community's name leads the title when we have it.
  const orgName = data.org && data.org.name
  const title = data.title || 'HOA Connect'
  const options = {
    body: data.body || '',
    icon: '/icon-192x192.png',
    badge: '/icon-72x72.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '/', org: data.org || null },
  }
  if (orgName) options.body = options.body ? `${orgName} · ${options.body}` : orgName
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      // `data.badge` is the server's authoritative unread count when it has one;
      // otherwise this push is worth exactly one badge.
      typeof data.badge === 'number' ? setBadge(data.badge) : bumpBadge(1),
    ]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    (async () => {
      // Opening the app is reading it — the page re-syncs the true count on load.
      await setBadge(0)
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of all) {
        if (client.url.includes(target) && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
    })(),
  )
})

// An open page's unread count always wins.
self.addEventListener('message', (event) => {
  const msg = event.data
  if (msg && msg.type === 'badge') event.waitUntil(setBadge(msg.count))
})

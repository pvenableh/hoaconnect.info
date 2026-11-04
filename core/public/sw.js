/* HOA Connect service worker — web push, notification clicks, app-icon badge.
 * Plain JS, no build step, served from the layer's public/ at root scope.
 *
 * Deliberately has NO fetch handler and caches no app assets: offline support is
 * not what this is for, and an asset cache here would fight the versioning
 * system (a stale cached bundle would shadow a fresh deploy). The only Cache
 * Storage it touches is one entry holding the badge count. */

// Bump when the logic below changes in a way worth seeing in a console log.
// (The browser re-installs on ANY byte change; this is purely diagnostic.)
const SW_VERSION = '2'

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
      console.info('[sw] active, version', SW_VERSION)
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
  const url = data.url || '/'

  // Buttons: the payload's `actions` are { action, title, url }. The browser only
  // takes { action, title } (and shows at most `Notification.maxActions`), so the
  // urls ride in `data` and are looked up again on the click.
  const max = typeof Notification !== 'undefined' && Number(Notification.maxActions) > 0 ? Number(Notification.maxActions) : 2
  const actions = (Array.isArray(data.actions) ? data.actions : [])
    .filter((a) => a && a.action && a.title)
    .slice(0, max)
  const actionUrls = {}
  for (const a of actions) if (a.url) actionUrls[a.action] = a.url

  const options = {
    body: data.body || '',
    icon: '/icon-192x192.png',
    badge: '/icon-72x72.png',
    data: { url, actionUrls, org: data.org || null },
  }
  if (actions.length) options.actions = actions.map((a) => ({ action: a.action, title: a.title }))
  // A tag makes a newer notification REPLACE the older one with that tag, and
  // `renotify` makes the replacement buzz again. `renotify` without a tag throws
  // in some browsers, so they only ever go together.
  if (data.tag) {
    options.tag = data.tag
    options.renotify = true
  }
  if (orgName) options.body = options.body ? `${orgName} · ${options.body}` : orgName

  // `badgeCount` is the server's authoritative unread total when it has one
  // (`badge` on the Notification API is the ICON, a different thing; a legacy
  // numeric `badge` is still honoured). Otherwise this push is worth one.
  const count = typeof data.badgeCount === 'number' ? data.badgeCount : typeof data.badge === 'number' ? data.badge : null
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      count !== null ? setBadge(count) : bumpBadge(1),
    ]),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const d = event.notification.data || {}
  // A button's own link when it has one; the body and "Open" go to the notification's.
  const target = (event.action && d.actionUrls && d.actionUrls[event.action]) || d.url || '/'
  event.waitUntil(
    (async () => {
      // Opening the app is reading it — the page re-syncs the true count on load.
      await setBadge(0)
      // An .ics (or any API download) is not a page: hand it to the browser in a
      // new window rather than navigating the open app away to a file.
      const isFile = /\/api\//.test(target)
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (!isFile) {
        for (const client of all) {
          let sameOrigin = false
          try {
            sameOrigin = new URL(client.url).origin === self.location.origin
          } catch (e) {
            continue
          }
          if (!sameOrigin) continue
          // Reuse the open window rather than piling up tabs: focus it, then ask
          // the page to route in-app (a reload would lose what they're doing).
          if ('focus' in client) await client.focus().catch(() => {})
          client.postMessage({ type: 'push-navigate', url: target })
          return
        }
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

/* ── Subscription self-healing ──────────────────────────────────────────────
 * Push services rotate subscriptions (Chrome refreshes endpoints; any browser
 * invalidates one if its keys change or storage is evicted) and fire
 * `pushsubscriptionchange`. The OLD endpoint then fails silently, and the page
 * only re-subscribes when someone toggles the setting. So re-subscribe here and
 * tell the server which endpoint this replaces. The session cookie is in the
 * browser's jar, so the POST authenticates normally. */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        let key = event.oldSubscription && event.oldSubscription.options && event.oldSubscription.options.applicationServerKey
        if (!key) {
          const res = await fetch('/api/user/push/config', { credentials: 'include' })
          if (!res.ok) throw new Error('config ' + res.status)
          const cfg = await res.json()
          if (!cfg.enabled || !cfg.publicKey) throw new Error('push is off')
          key = base64UrlToUint8Array(cfg.publicKey)
        }
        const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
        const json = sub.toJSON()
        await fetch('/api/user/push/subscribe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: json.keys,
            previous_endpoint: (event.oldSubscription && event.oldSubscription.endpoint) || undefined,
          }),
        })
      } catch (e) {
        /* nothing more to do from here — the account page shows "off" on the next visit */
      }
    })(),
  )
})

function base64UrlToUint8Array(b64) {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

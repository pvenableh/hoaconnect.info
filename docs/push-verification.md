# Push verification — the device matrix

**Who runs this: Peter.** Nothing here has been run on a device. The code is built
and unit-tested; delivery to hardware is the one thing a model can't check. Tick a
box only when you've seen it. This closes `docs/go-live-checklist.md` §5's "verify
delivery to a real device" item.

## Before you start

- [ ] Production VAPID pair set and redeployed (go-live §5). In the browser console, signed in:
      `await $fetch('/api/user/push/config')` → `{ enabled: true, publicKey: "B…" }`.
- [ ] The service worker is registered on **every** page now (not just after opting in). In DevTools →
      Application → Service Workers: `sw.js` is *activated and running*, and the console shows
      `[sw] active, version 2`.
- [ ] `https://<community host>/manifest.webmanifest` shows `"id": "/"`, `"start_url": "/?source=pwa"` and
      four `shortcuts` (Pay dues, Requests, Documents, Channels) on a community's host. The platform's own
      host has none — that is intended.

## The route you test with

`POST /api/user/push/test` — signed in, it sends **you** one push (title "Notifications are on", tag
`push-test`) and answers `{ sent: N }`, N = how many of your devices accepted it. It ignores category
mutes on purpose. The account page's **Send a test notification** button calls it. `sent: 0` with a
subscribed device means the push service refused (check the server log for `[push] send failed`).

## The matrix

Each row: **subscribe → test → received → click routes → badge clears.** Run it once per row.

| Device | Install first? | Subscribe → test | Received (app closed) | Click routes in-app | Badge clears on open |
|---|---|---|---|---|---|
| **iPhone / iPad, iOS 17+, Safari, installed (standalone)** | Yes — Share → Add to Home Screen; open from the Home Screen icon | [ ] | [ ] | [ ] | [ ] |
| **Android, Chrome** | Optional (a tab works); the install card or ⋮ → Install app | [ ] | [ ] | [ ] | [ ] |
| **Desktop Chrome (macOS)** | Optional | [ ] | [ ] | [ ] | [ ] |
| Desktop Safari / Firefox (spot check) | No | [ ] | [ ] | [ ] | [ ] |

iOS delivers web push **only** to the installed Home Screen app (16.4+, so 17+ is the supported floor) —
never a Safari tab. If the Push card on the account page says "Add HOA Connect to your Home Screen
first", that's it working as designed.

### Steps, for each row

1. **Subscribe.** Account → Push notifications → *Turn on* → allow the permission prompt.
2. **Close the app** (swipe it away; on desktop, close the tab or the window).
3. **Test.** From another device or the console: `await $fetch('/api/user/push/test', { method: 'POST' })`
   → `{ sent: 1 }`.
4. **Received** — the notification appears within a few seconds. Title "Notifications are on".
5. **Click routes** — tap it. The app opens (or focuses if it was already open) at the community. With the
   app **open on another page**, tap a second test: it should move in place (no reload — your scroll
   position and any open form survive); this is the `push-navigate` message.
6. **Badge clears** — the number on the icon (iOS Home Screen, Android launcher, macOS Dock) is set when
   the push arrives and cleared when the app is opened; after opening, the bell and the icon agree.

## The reminder notifications (buttons)

Turn one rule on in Settings → Organization → Reminders, then *Send me a test* (or *Check the next 24
hours*). Expect, on a device that shows action buttons (Android and desktop Chrome do; **iOS shows none** —
the tap itself goes to the right page):

| Reminder | Button | Lands on |
|---|---|---|
| Dues | **Pay** | `/{slug}/payments` |
| Meeting | **Add to calendar** | `/api/meetings/{id}/calendar` — an `.ics` file the OS offers to add |
| Request | **Open** | `/{slug}/requests/{id}` |

- [ ] Dues button opens Payments.
- [ ] Meeting button downloads/offers the calendar event (title, place, an hour long).
- [ ] Request button opens the request.
- [ ] A second reminder for the *same* item replaces the first and buzzes again (the `tag` + `renotify`).
- [ ] The meeting-in-an-hour reminder, left unread past the meeting, is **not** delivered late (TTL).

## Subscription rotation (spot check, optional)

Chrome rotates a push endpoint from time to time; the worker re-subscribes and tells the server which
endpoint it replaces. DevTools → Application → Service Workers → *Push* can't fire
`pushsubscriptionchange`, so this is only checkable by waiting: after a few weeks a subscribed device
should still receive the test. A device that stops receiving is the signal.

## What is not covered by this document

- Channel messages don't push yet — that arrives with Phase 7.
- The per-user badge number: a push with no server-side count bumps the icon by one and the open page
  corrects it to the true unread total. A server-supplied `badgeCount` is supported by the payload and
  worker but no sender computes one yet.

## Record

| Date | Device / OS / browser | Result | Notes |
|---|---|---|---|
| | | | |

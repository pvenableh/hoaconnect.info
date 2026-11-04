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

## Channel messages

Needs two people who are admins or active board members of the same community (one on the device under
test), the **Channels** category on (Account → Notifications → *Channel messages*, on by default), and
`pnpm add:channel-phase7` run. From the *other* person's browser, post in a channel the device-holder
belongs to. Expect a push titled `#channel`, body `Name: the message…`, one **Open** button (not on iOS),
tapping it lands in that channel (`/{slug}/admin/channels/{id}`).

- [ ] A message pushes, with the channel in the title and the sender in the body.
- [ ] A **second** message in the same channel *replaces* the first notification and buzzes again (the
      `tag` is per channel, `hoa_channels:{id}`) — the shade never fills with one per message.
- [ ] The bell shows **one** row, "2 new in #channel", not two; reading it and posting again starts "1 new".
- [ ] With the channel **open and visible** on the device (a heartbeat in the last ~90 s), a new message
      does *not* push. Close the tab/app, wait 90 s, post again — now it does.
- [ ] A channel **muted** for that person (Channel members panel → mute) never pushes.
- [ ] A direct message pushes as the sender's name (not `#…`) and the bell reads "N new from Name".
- [ ] An @-mention still arrives as its own "mentioned you" push, and the mentioned person gets **no**
      additional "new in #channel" for the same message.
- [ ] The author never notifies themselves.

## Subscription rotation (spot check, optional)

Chrome rotates a push endpoint from time to time; the worker re-subscribes and tells the server which
endpoint it replaces. DevTools → Application → Service Workers → *Push* can't fire
`pushsubscriptionchange`, so this is only checkable by waiting: after a few weeks a subscribed device
should still receive the test. A device that stops receiving is the signal.

## What is not covered by this document

- The per-user badge number (channel pushes included — a per-recipient unread read was judged not worth it
  for a chatty channel; see Session 12): a push with no server-side count bumps the icon by one and the open page
  corrects it to the true unread total. A server-supplied `badgeCount` is supported by the payload and
  worker but no sender computes one yet.

## Record

| Date | Device / OS / browser | Result | Notes |
|---|---|---|---|
| | | | |

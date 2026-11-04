// Phase 6 browser verification (Round 3): the always-on service worker, the install
// card, the standalone plugin, the per-host manifest and sw.js's headers.
//
//   pnpm build && PORT=3418 node --env-file=.env .output/server/index.mjs &
//   NODE_PATH=<dir holding playwright> node --env-file=.env scripts/browser/verify-p6-pwa.cjs http://localhost:3418
//
// Signs in through POST /api/demo/login on the `demo` org, in light and in dark. Writes
// nothing to Directus. Push DELIVERY is not checked here — a headless browser has no push
// service; that is docs/push-verification.md, for Peter's devices.
//
//   worker      registered on load (no push opt-in), scope "/", updateViaCache "none", active
//   card        admin home and the resident view: a captured beforeinstallprompt shows the glass
//               card with an Install button; Dismiss hides it and it stays hidden after a reload
//               (this build); an iPhone-Safari user agent shows the Share → Add to Home Screen steps
//   standalone  display-mode: standalone → <html data-standalone>, and no card
//   manifest    id, start_url, four shortcuts on a community host (x-forwarded-host), none on the
//               platform host; sw.js is served no-cache; the ICS route is auth-gated
// Screenshots go to $OUT_DIR (default: the OS temp dir) and are only worth opening on a FAIL.
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://localhost:3000";
const ORG = process.env.ORG_SLUG || "demo";
const OUT = process.env.OUT_DIR || require("os").tmpdir();
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

async function newPage(browser, mode, opts = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    colorScheme: mode,
    locale: "en-US",
    ...(opts.userAgent ? { userAgent: opts.userAgent } : {}),
  });
  await context.addInitScript(
    ({ m, standalone }) => {
      try {
        // Headless Chromium on macOS crashes the renderer when a SERVICE WORKER calls the Badging API
        // (setAppBadge), and a signed-in page posts the unread count to the worker on every load
        // (useAppBadge). Real Chrome is fine; this is the harness. So the page doesn't hand the worker
        // that message here (and has no Badging API of its own); the worker is otherwise the real sw.js.
        delete Navigator.prototype.setAppBadge;
        delete Navigator.prototype.clearAppBadge;
        const post = ServiceWorker.prototype.postMessage;
        ServiceWorker.prototype.postMessage = function (msg, ...rest) {
          if (msg && msg.type === "badge") return;
          return post.call(this, msg, ...rest);
        };
      } catch {}
      try {
        localStorage.setItem("appearance", m);
        const read = Storage.prototype.getItem;
        Storage.prototype.getItem = function (k) {
          if (k === "hoa:whats-new-seen-line") throw new Error("seen");
          return read.call(this, k);
        };
      } catch {}
      if (standalone) {
        const mm = window.matchMedia.bind(window);
        window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } : mm(q));
      }
    },
    { m: mode, standalone: !!opts.standalone }
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page, errors };
}
const signIn = (page) => page.request.post(`${BASE}/api/demo/login`).then((r) => r.ok());

/** What Chrome does on its own: hand the page a deferred install prompt. */
const fireInstallPrompt = (page) =>
  page.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    e.prompt = () => Promise.resolve();
    e.userChoice = Promise.resolve({ outcome: "dismissed" });
    window.dispatchEvent(e);
  });

async function checkWorker(page, mode) {
  await page.goto(`${BASE}/${ORG}`, { waitUntil: "networkidle" });
  const reg = await page.evaluate(async () => {
    const r = await Promise.race([navigator.serviceWorker.ready, new Promise((res) => setTimeout(() => res(null), 15000))]);
    if (!r) return null;
    return { scope: new URL(r.scope).pathname, updateViaCache: r.updateViaCache, active: r.active ? r.active.state : null, script: r.active ? new URL(r.active.scriptURL).pathname : null };
  });
  check(`[${mode}] the worker is registered on load, with no push opt-in`, !!reg && reg.scope === "/" && reg.script === "/sw.js", JSON.stringify(reg));
  check(`[${mode}] updateViaCache is "none"`, reg?.updateViaCache === "none");
  check(`[${mode}] the worker is active`, reg?.active === "activated", String(reg?.active));
}

async function checkCard(page, mode, path, label) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  const card = page.locator('[data-testid="install-card"]');
  check(`[${mode}] ${label}: no card before the browser offers an install`, (await card.count()) === 0);
  await fireInstallPrompt(page);
  await card.waitFor({ timeout: 10000 }).catch(() => {});
  check(`[${mode}] ${label}: the card shows once beforeinstallprompt is captured`, (await card.count()) === 1);
  check(`[${mode}] ${label}: it has an Install button and is a glass surface`, (await page.locator('[data-testid="install-card-install"]').count()) === 1 && (await card.evaluate((el) => el.classList.contains("glass-surface")).catch(() => false)));
  if (mode === "dark") await page.screenshot({ path: `${OUT}/p6-card-${label}-${mode}.png` });
  await page.locator('[data-testid="install-card-dismiss"]').click();
  check(`[${mode}] ${label}: Dismiss hides it`, (await card.count()) === 0);
  await page.reload({ waitUntil: "networkidle" });
  await fireInstallPrompt(page);
  await page.waitForTimeout(800);
  check(`[${mode}] ${label}: it stays hidden after a reload (dismissed for this build)`, (await card.count()) === 0);
  await page.evaluate(() => localStorage.removeItem("hoa-install-dismissed"));
}

async function checkIos(browser, mode) {
  const { context, page, errors } = await newPage(browser, mode, { userAgent: IPHONE_SAFARI });
  check(`[${mode}] iOS: signed in`, await signIn(page));
  await page.goto(`${BASE}/${ORG}`, { waitUntil: "networkidle" });
  await page.locator('[data-testid="install-card"]').waitFor({ timeout: 10000 }).catch(() => {});
  check(`[${mode}] iOS Safari: the card shows the Share → Add to Home Screen steps`, (await page.locator('[data-testid="install-card-ios-steps"]').count()) === 1 && (await page.locator('[data-testid="install-card-install"]').count()) === 0);
  check(`[${mode}] iOS: no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await context.close();
}

async function checkStandalone(browser, mode) {
  const { context, page, errors } = await newPage(browser, mode, { standalone: true });
  check(`[${mode}] standalone: signed in`, await signIn(page));
  await page.goto(`${BASE}/${ORG}`, { waitUntil: "networkidle" });
  await fireInstallPrompt(page);
  await page.waitForTimeout(800);
  check(`[${mode}] standalone: <html data-standalone> is set`, (await page.evaluate(() => document.documentElement.dataset.standalone)) === "true");
  check(`[${mode}] standalone: no install card`, (await page.locator('[data-testid="install-card"]').count()) === 0);
  // A router link must still be a client-side navigation (no full reload), not trapped.
  const marker = await page.evaluate(() => (window.__p6 = Math.random()));
  const link = page.locator('a[href^="/' + ORG + '/"]').first();
  if (await link.count()) {
    await link.click().catch(() => {});
    await page.waitForTimeout(1200);
    check(`[${mode}] standalone: a router link navigates without a full reload`, (await page.evaluate(() => window.__p6)) === marker);
  }
  check(`[${mode}] standalone: no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await context.close();
}

async function checkManifest() {
  const community = await (await fetch(`${BASE}/api/manifest.webmanifest`, { headers: { "x-forwarded-host": `${ORG}.localhost` } })).json();
  check("[manifest] id and start_url", community.id === "/" && community.start_url === "/?source=pwa", `${community.id} ${community.start_url}`);
  const names = (community.shortcuts || []).map((s) => s.name);
  check("[manifest] four shortcuts on a community host", JSON.stringify(names) === JSON.stringify(["Pay dues", "Requests", "Documents", "Channels"]), names.join(", "));
  check("[manifest] shortcuts are under the community's slug", (community.shortcuts || []).every((s) => s.url.startsWith(`/${ORG}/`)), (community.shortcuts || [])[0]?.url);
  const platform = await (await fetch(`${BASE}/api/manifest.webmanifest`)).json();
  check("[manifest] the platform host still serves a manifest (id + start_url), without shortcuts", platform.id === "/" && platform.start_url === "/?source=pwa" && !platform.shortcuts);
  const sw = await fetch(`${BASE}/sw.js`);
  check("[sw.js] served as JavaScript with a no-cache rule", sw.ok && /javascript/.test(sw.headers.get("content-type") || "") && /no-cache|no-store|max-age=0/.test(sw.headers.get("cache-control") || ""), sw.headers.get("cache-control") || "");
  const ics = await fetch(`${BASE}/api/meetings/not-a-real-id/calendar`);
  check("[ics] the calendar route is auth-gated", ics.status === 401, String(ics.status));
}

(async () => {
  await checkManifest().catch((e) => check("[manifest] ran", false, e.message));
  const browser = await chromium.launch();
  try {
    for (const mode of ["light", "dark"]) {
      const { context, page, errors } = await newPage(browser, mode);
      check(`[${mode}] signed in to the demo org`, await signIn(page));
      await checkWorker(page, mode).catch((e) => check(`[${mode}] worker check ran`, false, e.message.split("\n")[0]));
      await checkCard(page, mode, `/${ORG}`, "admin").catch((e) => check(`[${mode}] admin card check ran`, false, e.message.split("\n")[0]));
      await checkCard(page, mode, `/${ORG}?as=member`, "resident").catch((e) => check(`[${mode}] resident card check ran`, false, e.message.split("\n")[0]));
      check(`[${mode}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
      await context.close();
      await checkIos(browser, mode).catch((e) => check(`[${mode}] iOS check ran`, false, e.message.split("\n")[0]));
      await checkStandalone(browser, mode).catch((e) => check(`[${mode}] standalone check ran`, false, e.message.split("\n")[0]));
    }
  } catch (e) {
    check("script ran to completion", false, e.message.split("\n").slice(0, 4).join(" | "));
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();

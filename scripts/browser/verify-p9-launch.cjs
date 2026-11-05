// Phase 9 browser verification (Round 3): the subscription page and the Reports PDF.
//
//   pnpm build && PORT=3429 node --env-file=.env .output/server/index.mjs &
//   NODE_PATH=<dir holding playwright> node --env-file=.env scripts/browser/verify-p9-launch.cjs http://localhost:3429
//
// Signs in through POST /api/demo/login (the shared demo admin) in light and dark.
//
//   subscription  /settings/subscription renders ONE surface with the status chip, the org's
//                 band (from /api/org/billing/band), a price or a contact line, and the band
//                 ladder; the interval switch changes the quoted price; Subscribe on a demo
//                 org is refused by the server (403 "disabled in the demo") with a toast and
//                 no checkout dialog — proving the page talks to the authenticated band route
//   layouts       /payments (now `auth`) shows the workspace dock; /subscription-expired (now
//                 `auth-blank`) renders chromeless in theme-app — the deleted `default` layout
//                 is not needed by either
//   reports       /<org>/admin/payments → Reports → PDF downloads a real PDF (%PDF header,
//                 a few KB, named <org>-financial-report-<date>.pdf) without a page error
//
// NOT covered: a real checkout (needs a non-demo org and Stripe band prices) — the route's
// money logic is unit-tested (tests/shared/billing-phase9.test.ts) and the webhook side is
// replayed from fixtures (tests/server/stripe-webhook-replay.test.ts).
// Screenshots go to $OUT_DIR (default: the OS temp dir) and are only worth opening on a FAIL.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = process.argv[2] || "http://localhost:3000";
const ORG = process.env.ORG_SLUG || "demo";
const OUT = process.env.OUT_DIR || require("os").tmpdir();
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

async function newPage(browser, mode) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    colorScheme: mode,
    locale: "en-US",
    acceptDownloads: true,
  });
  await context.addInitScript(
    ({ m }) => {
      try {
        // Headless Chromium on macOS crashes when a service worker calls the Badging API
        // (see verify-p6-pwa.cjs): never hand the worker the badge message.
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
        localStorage.setItem("hoa:whats-new-seen-line", "9.9");
      } catch {}
    },
    { m: mode }
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page, errors };
}

async function run(browser, mode) {
  const { context, page, errors } = await newPage(browser, mode);
  const signed = await page.request.post(`${BASE}/api/demo/login`).then((r) => r.ok());
  check(`[${mode}] demo sign-in`, signed);
  if (!signed) return context.close();

  // Land in the org first so the selected org is the demo community.
  await page.goto(`${BASE}/${ORG}`, { waitUntil: "networkidle" });

  // ── subscription ─────────────────────────────────────────────────────────
  // The page fetches its quote during SSR, so ask the route directly from the signed-in page too.
  await page.goto(`${BASE}/settings/subscription`, { waitUntil: "networkidle" });
  const quoteRes = await page.evaluate(async (slug) => {
    const org = await fetch(`/api/hoa/by-slug?slug=${slug}`).then((r) => r.json()).catch(() => null);
    const r = await fetch(`/api/org/billing/band?organizationId=${org?.id}`);
    return { status: r.status, body: await r.json().catch(() => null) };
  }, ORG);
  check(
    `[${mode}] /api/org/billing/band answers an admin with units, band and ladder`,
    quoteRes.status === 200 && typeof quoteRes.body?.units === "number" && Array.isArray(quoteRes.body?.ladder),
    `HTTP ${quoteRes.status} · ${quoteRes.body?.units} units · ${quoteRes.body?.band?.name ?? "no band"} · ${quoteRes.body?.ladder?.length} bands`
  );
  // Its own request context: a 401 can clear the session cookie, and the page's context would keep that.
  const anonCtx = await require("playwright").request.newContext();
  const anon = await anonCtx.get(`${BASE}/api/org/billing/band?organizationId=x`).then((r) => r.status()).catch(() => 0);
  await anonCtx.dispose();
  check(`[${mode}] … and refuses a request with no session`, anon === 401 || anon === 403, `HTTP ${anon}`);
  const quote = quoteRes.body;

  const surfaces = await page.locator('[data-testid="subscription-surface"]').count();
  check(`[${mode}] one settings surface`, surfaces === 1, `${surfaces}`);
  const status = (await page.locator('[data-testid="subscription-status"]').innerText().catch(() => "")).trim();
  check(`[${mode}] a status chip`, status.length > 0, status);

  const isFree = /free account/i.test(status);
  if (isFree) {
    check(`[${mode}] a free account shows no quote`, (await page.locator('[data-testid="subscription-quote"]').count()) === 0);
  } else {
    const bandName = (await page.locator('[data-testid="subscription-band"]').innerText().catch(() => "")).trim();
    check(`[${mode}] the org's band is named`, bandName.length > 0 && bandName === (quote?.band?.name || "No band"), `${bandName} / ${quote?.band?.name}`);
    const ladder = await page.locator('[data-testid="subscription-ladder"] li').count();
    check(`[${mode}] the band ladder lists every band`, ladder === (quote?.ladder?.length ?? -1), `${ladder} rows`);

    const price = page.locator('[data-testid="subscription-price"]');
    if (quote?.monthly?.available && (await price.count())) {
      const monthly = (await price.innerText()).trim();
      await page.getByRole("tab", { name: "Annual" }).click().catch(() => {});
      await page.waitForTimeout(300);
      const annual = (await price.innerText().catch(() => "")).trim();
      check(`[${mode}] the interval switch re-quotes`, quote.annual?.available ? annual !== monthly : true, `${monthly} → ${annual}`);

      const subscribe = page.locator('[data-testid="subscription-subscribe"]');
      if (await subscribe.count()) {
        const resP = page.waitForResponse((r) => r.url().includes("/api/stripe/subscribe-band"), { timeout: 15000 }).catch(() => null);
        await subscribe.click();
        const res = await resP;
        const toast = await page.locator("[data-sonner-toast]").first().innerText({ timeout: 8000 }).catch(() => "");
        check(`[${mode}] Subscribe on the demo is refused by the server`, !!res && res.status() === 403, res ? `HTTP ${res.status()}` : "no request");
        check(`[${mode}] … with a toast and no checkout`, /demo/i.test(toast) && (await page.getByRole("dialog").count()) === 0, toast.slice(0, 80));
      }
    } else {
      const text = await page.locator('[data-testid="subscription-quote"]').innerText().catch(() => "");
      check(`[${mode}] no self-serve price: an explanation instead`, text.length > 20, `${quote?.monthly?.reason || "?"}: ${text.slice(0, 80)}`);
    }
  }
  await page.screenshot({ path: path.join(OUT, `p9-subscription-${mode}.png`), fullPage: true }).catch(() => {});

  // ── layouts ──────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/payments`, { waitUntil: "networkidle" });
  const dock = await page.locator("nav").count();
  check(`[${mode}] /payments renders in the workspace layout`, dock > 0 && !page.url().includes("/login"), page.url());
  await page.goto(`${BASE}/subscription-expired`, { waitUntil: "networkidle" });
  const themed = await page.evaluate(() => document.documentElement.className + " " + document.body.className).catch(() => "");
  check(`[${mode}] /subscription-expired renders chromeless in theme-app`, /theme-app/.test(themed), themed.slice(0, 80));

  // ── reports PDF ──────────────────────────────────────────────────────────
  await page.goto(`${BASE}/${ORG}/admin/payments`, { waitUntil: "networkidle" });
  // Dismiss a first-run coach mark if one is up, then pick the Reports tab.
  await page.getByRole("button", { name: "Got it" }).first().click({ timeout: 2000 }).catch(() => {});
  await page.locator("button", { hasText: /^\s*Reports\s*$/ }).first().click().catch(() => {});
  const pdfBtn = page.locator('[data-testid="reports-export-pdf"]');
  await pdfBtn.waitFor({ timeout: 15000 }).catch(() => {});
  check(`[${mode}] the Reports tab offers PDF`, (await pdfBtn.count()) === 1);
  if (await pdfBtn.count()) {
    const dlP = page.waitForEvent("download", { timeout: 30000 }).catch(() => null);
    await pdfBtn.click();
    const dl = await dlP;
    const name = dl ? dl.suggestedFilename() : "";
    check(`[${mode}] a PDF downloads with a dated, org-named filename`, /-financial-report-\d{4}-\d{2}-\d{2}\.pdf$/.test(name), name);
    if (dl) {
      const file = path.join(OUT, `p9-${mode}-${name}`);
      await dl.saveAs(file);
      const buf = fs.readFileSync(file);
      check(`[${mode}] it is a real PDF`, buf.subarray(0, 5).toString() === "%PDF-" && buf.length > 2000, `${buf.length} bytes`);
    }
  }
  await page.screenshot({ path: path.join(OUT, `p9-reports-${mode}.png`) }).catch(() => {});

  check(`[${mode}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await context.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const mode of ["light", "dark"]) await run(browser, mode);
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();

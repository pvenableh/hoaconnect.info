// Phase 3a browser verification (Round 3): unsubscribe, preferences, suppression UI.
//
//   PORT=3123 node .output/server/index.mjs &          (a built server, the project's .env)
//   NODE_PATH=<dir holding playwright> node scripts/browser/verify-p3a-email.cjs http://localhost:3123 [--session]
//
// Without --session it checks the public /unsubscribe page only. With --session
// it also signs in through POST /api/demo/login (the one-click demo account — no
// password is typed here) and checks the Email section of the household page,
// the Members page's bounced / unsubscribed chips and the composer's Delivery
// control on the `demo` org, in light and dark.
//
// It SENDS NO MAIL and WRITES NOTHING. Every write the UI makes is intercepted
// with page.route and answered locally (the request body is what is checked);
// the reads are real, except where a state can't exist yet (a provisioned
// member, a bounced member) and is answered by the route instead — each such
// check says "(mocked)". Every context emulates prefers-reduced-transparency:
// no-preference (a Mac with Reduce Transparency on reports `reduce` to headless
// Chromium too). Screenshots go to $OUT_DIR (default: the OS temp dir).
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://localhost:3000";
const SESSION = process.argv.includes("--session");
const ORG = process.env.ORG_SLUG || "demo";
const OUT = process.env.OUT_DIR || require("os").tmpdir();
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
// A well-formed token that names nobody (32 base64url characters).
const NOBODY = "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";

async function newPage(browser, { mode = "light", width = 1280, height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: mode });
  await context.addInitScript((m) => {
    try {
      localStorage.setItem("appearance", m);
      const read = Storage.prototype.getItem;
      Storage.prototype.getItem = function (k) {
        if (k === "hoa:whats-new-seen-line") throw new Error("seen");
        return read.call(this, k);
      };
    } catch {}
  }, mode);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "no-preference" }],
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page, errors };
}

// A bare router push (the app's own client-side navigation).
const push = (page, path) =>
  page.evaluate((p) => document.querySelector("#__nuxt").__vue_app__.config.globalProperties.$router.push(p), path);
/** Wait until `sel` is fully opaque — a page arriving by the router fades in. */
const opaque = (page, sel) =>
  page
    .waitForFunction(
      (s) => {
        let el = document.querySelector(s);
        if (!el) return false;
        let op = 1;
        for (; el; el = el.parentElement) op *= Number(getComputedStyle(el).opacity);
        return op > 0.99;
      },
      sel,
      { timeout: 8000 }
    )
    .then(() => true)
    .catch(() => false);
const isDark = (page) => page.evaluate(() => document.documentElement.classList.contains("dark"));
const visible = (page, sel, timeout = 10000) =>
  page
    .waitForSelector(sel, { state: "visible", timeout })
    .then(() => true)
    .catch(() => false);
// useConfirm's glass AlertDialog is role="alertdialog"; sheets and modals are "dialog".
const visibleDialog = (page) => visible(page, '[role="alertdialog"], [role="dialog"]', 8000);
const textOf = (page, sel) => page.locator(sel).first().textContent().then((t) => (t || "").trim()).catch(() => "");
/** The glass card really is glass: a translucent fill with a backdrop blur. */
const glassOf = (page, sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, blur: cs.backdropFilter || cs.webkitBackdropFilter || "" };
  }, sel);
/** Wait for a request matching `pred` and return its JSON body. */
const nextBody = (page, pred) =>
  page
    .waitForRequest((r) => pred(r), { timeout: 8000 })
    .then((r) => {
      try {
        return r.postDataJSON();
      } catch {
        return null;
      }
    })
    .catch(() => null);

async function signIn(page) {
  const res = await page.request.post(`${BASE}/api/demo/login`);
  return res.ok();
}

// ── /unsubscribe — public, no session ───────────────────────────────────────
async function runUnsubscribe(browser, mode) {
  const { context, page, errors } = await newPage(browser, { mode });

  await page.goto(`${BASE}/unsubscribe`, { waitUntil: "networkidle" });
  check(`[unsub ${mode}] page is in ${mode} mode`, (await isDark(page)) === (mode === "dark"));
  check(`[unsub ${mode}] no token → "manage your email" with sign-in`, await visible(page, '[data-state="no-token"]'));
  const glass = await glassOf(page, "[data-unsubscribe]");
  check(`[unsub ${mode}] the card is glass`, !!glass && /blur/.test(glass.blur), JSON.stringify(glass));

  await page.goto(`${BASE}/unsubscribe?token=${NOBODY}`, { waitUntil: "networkidle" });
  check(`[unsub ${mode}] a token that names nobody → "no longer works" (real read)`, await visible(page, '[data-state="invalid"]'));

  // The one-click endpoint, as a mailbox provider calls it: no session, 200 or
  // 503 (503 while the fields are not provisioned — the read can't run), never
  // a body; GET redirects a person to the page.
  const oc = await page.request.post(`${BASE}/api/email/unsubscribe/one-click?token=${NOBODY}`, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: "List-Unsubscribe=One-Click",
  });
  const ocBody = await oc.text();
  check(`[unsub ${mode}] one-click POST: no session, ${oc.status()}, empty body`, [200, 503].includes(oc.status()) && ocBody === "", `status=${oc.status()}`);
  const ocGet = await page.request.get(`${BASE}/api/email/unsubscribe/one-click?token=${NOBODY}`, { maxRedirects: 0 });
  check(
    `[unsub ${mode}] one-click GET redirects to the page`,
    ocGet.status() === 302 && (ocGet.headers().location || "").startsWith(`/unsubscribe?token=${NOBODY}`),
    `${ocGet.status()} ${ocGet.headers().location || ""}`
  );

  // The member's states, from a mocked read (no provisioned member exists yet).
  let optedOut = false;
  const posts = [];
  await page.route("**/api/email/unsubscribe?**", (route) =>
    route.fulfill({
      json: {
        valid: true,
        org: { name: "Demo Community", slug: ORG },
        email: "p•••t@example.com",
        optedOut,
        optedOutAt: null,
        bounced: false,
        essential: ["Dues and assessments", "Meeting notices", "Violations", "Governance and votes", "Membership"],
        preferencesUrl: `${BASE}/${ORG}/profile#email`,
      },
    })
  );
  await page.route("**/api/email/unsubscribe", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = route.request().postDataJSON();
    posts.push(body);
    optedOut = body.action === "unsubscribe";
    return route.fulfill({ json: { ok: true, optedOut } });
  });
  const T = "AbCdEfGhIjKlMnOpQrStUvWxYz012-_9";
  // A hard load reads during SSR, out of page.route's reach; arrive by the
  // router instead so the read happens in the browser and meets the mock.
  await page.goto(`${BASE}/ui-kit`, { waitUntil: "networkidle" });
  await push(page, `/unsubscribe?token=${T}&e=e-1`);
  check(`[unsub ${mode}] subscribed state asks first (mocked)`, await visible(page, '[data-state="subscribed"]'));
  check(`[unsub ${mode}] heading`, (await textOf(page, "[data-unsubscribe] h1")) === "Unsubscribe from community email?");
  const items = await page.locator("[data-essential-list] li").count();
  check(`[unsub ${mode}] lists what they'll still receive`, items === 5, String(items));
  check(`[unsub ${mode}] shows the masked address`, (await page.locator("[data-unsubscribe]").textContent()).includes("p•••t@example.com"));
  const prefHref = await page.locator('[data-link="preferences"]').getAttribute("href").catch(() => null);
  check(`[unsub ${mode}] links into the portal's email preferences`, prefHref === `${BASE}/${ORG}/profile#email`, prefHref || "none");
  check(`[unsub ${mode}] the card settles fully opaque`, await opaque(page, "[data-unsubscribe] h1"));
  await page.screenshot({ path: `${OUT}/p3a-unsubscribe-${mode}.png` });

  await page.click('[data-action="unsubscribe"]');
  const done = await page
    .waitForFunction(() => document.querySelector("[data-unsubscribe] h1")?.textContent?.trim() === "You're unsubscribed", null, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  check(`[unsub ${mode}] one tap → "You're unsubscribed"`, done);
  check(`[unsub ${mode}] the tap POSTs {token, action: unsubscribe}`, posts[0]?.token === T && posts[0]?.action === "unsubscribe", JSON.stringify(posts[0]));
  check(
    `[unsub ${mode}] offers the way back`,
    (await textOf(page, '[data-action="resubscribe"]')).includes("Changed your mind? Resubscribe")
  );
  await page.screenshot({ path: `${OUT}/p3a-unsubscribed-${mode}.png` });
  await page.click('[data-action="resubscribe"]');
  const back = await page
    .waitForFunction(() => document.querySelector("[data-unsubscribe] h1")?.textContent?.trim() === "You're back on the list", null, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  check(`[unsub ${mode}] resubscribe → "You're back on the list"`, back && posts[1]?.action === "resubscribe");

  check(`[unsub ${mode}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await context.close();
}

// ── The household page's Email section, signed in ───────────────────────────
async function runPreferences(browser, mode) {
  const { context, page, errors } = await newPage(browser, { mode });
  check(`[prefs ${mode}] signed in to the demo`, await signIn(page));

  // Real reads first: before the fields exist the community switch says so.
  await page.goto(`${BASE}/${ORG}/profile#email`, { waitUntil: "networkidle" });
  check(`[prefs ${mode}] page is in ${mode} mode`, (await isDark(page)) === (mode === "dark"));
  check(`[prefs ${mode}] Email section renders (hard load, #email)`, await visible(page, "[data-email-preferences]"));
  const glass = await glassOf(page, "[data-email-preferences]");
  check(`[prefs ${mode}] the section is glass`, !!glass && /blur/.test(glass.blur), JSON.stringify(glass));
  const real = await page.request.get(`${BASE}/api/user/email-subscription?organizationId=${await orgId(page)}`).then((r) => r.json()).catch(() => null);
  const communitySwitch = page.locator('[data-pref="community"] button[role="switch"]');
  if (real?.available) {
    check(`[prefs ${mode}] community switch is live (fields provisioned)`, !(await communitySwitch.isDisabled()));
  } else {
    check(
      `[prefs ${mode}] fields not provisioned → switch disabled and says so (real read)`,
      (await communitySwitch.isDisabled()) && (await visible(page, "[data-pref-unavailable]", 4000))
    );
  }
  const rows = await page.locator("[data-email-preferences] [data-category]").count();
  check(`[prefs ${mode}] the ten-category matrix`, rows === 10, String(rows));
  const switches = await page.locator('[data-pref="notifications"] button[role="switch"]').count();
  check(`[prefs ${mode}] master + 20 switches`, switches === 21, String(switches));
  check(`[prefs ${mode}] "Always sent" lists the essential mail`, (await textOf(page, '[data-pref="essential"]')).includes("Dues and assessments"));
  await page.screenshot({ path: `${OUT}/p3a-prefs-${mode}.png`, fullPage: true });

  // Interactive, with every write intercepted. The member is mocked as
  // provisioned and bounced, so both the switch and the banner can be seen.
  const subPatches = [];
  const prefPatches = [];
  await page.route("**/api/user/email-subscription?**", (route) =>
    route.fulfill({
      json: {
        available: true,
        member: true,
        email: "demo@example.com",
        communityOptOut: false,
        communityOptOutAt: null,
        bounced: true,
        bouncedAt: "2026-10-30T12:00:00Z",
      },
    })
  );
  await page.route("**/api/user/email-subscription", (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    subPatches.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/user/notification-preferences", (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    prefPatches.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto(`${BASE}/${ORG}/profile`, { waitUntil: "networkidle" });
  await visible(page, "[data-email-preferences]");
  check(`[prefs ${mode}] bounced banner (mocked)`, await visible(page, '[data-pref="bounced"]', 6000));
  const live = await page
    .waitForFunction(() => {
      const b = document.querySelector('[data-pref="community"] button[role="switch"]');
      return b && !b.disabled;
    }, null, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  check(`[prefs ${mode}] community switch enabled once provisioned (mocked)`, live);
  await communitySwitch.click();
  await page.waitForTimeout(400);
  check(
    `[prefs ${mode}] turning community email off PATCHes {organizationId, communityOptOut: true}`,
    subPatches[0]?.communityOptOut === true && typeof subPatches[0]?.organizationId === "string",
    JSON.stringify(subPatches[0])
  );

  const meetingsEmail = page.locator('[data-category="meeting"] button[role="switch"]').nth(1);
  const before = (await meetingsEmail.getAttribute("aria-checked")) === "true";
  await meetingsEmail.click();
  await page.waitForTimeout(400);
  const sentPrefs = prefPatches.find((p) => p.notification_preferences)?.notification_preferences;
  check(`[prefs ${mode}] a category's email switch PATCHes that key`, sentPrefs?.meeting === !before, JSON.stringify(sentPrefs));

  const master = page.locator('[data-pref="notifications"] > div:first-child button[role="switch"]');
  if ((await master.getAttribute("aria-checked")) === "true") {
    await master.click();
    await page.waitForTimeout(400);
    check(
      `[prefs ${mode}] master off PATCHes email_notifications:false and greys the email column`,
      prefPatches.some((p) => p.email_notifications === false) && (await meetingsEmail.isDisabled())
    );
  } else {
    check(`[prefs ${mode}] master is off for the demo user — email column greyed`, await meetingsEmail.isDisabled());
  }
  await page.screenshot({ path: `${OUT}/p3a-prefs-mocked-${mode}.png`, fullPage: true });

  check(`[prefs ${mode}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await context.close();
}

let _orgId = null;
async function orgId(page) {
  if (_orgId) return _orgId;
  const res = await page.request.get(`${BASE}/api/hoa/by-slug?slug=${ORG}`).then((r) => r.json()).catch(() => null);
  _orgId = res?.id || res?.organization?.id || res?.data?.id || null;
  return _orgId;
}

// ── Members page chips (mocked status; the Clear POST intercepted) ──────────
async function runMembers(browser, mode) {
  const { context, page, errors } = await newPage(browser, { mode });
  await signIn(page);
  const org = await orgId(page);
  const list = await page.request
    .post(`${BASE}/api/directus/items`, {
      data: { collection: "hoa_members", operation: "list", query: { fields: ["id"], filter: { organization: { _eq: org }, status: { _eq: "active" } }, sort: ["last_name"], limit: 50 } },
    })
    .then((r) => r.json())
    .catch(() => null);
  const ids = (Array.isArray(list) ? list : list?.data || []).map((m) => m.id);
  check(`[members ${mode}] read the roster's ids`, ids.length >= 2, String(ids.length));

  let realStatus = null;
  const clears = [];
  await page.route("**/api/hoa/member-email-status?**", async (route) => {
    realStatus = await route.fetch().then((r) => r.json()).catch(() => null);
    return route.fulfill({
      json: {
        available: true,
        members: ids.map((id, i) => ({
          id,
          bounced: i === 0,
          bouncedAt: i === 0 ? "2026-10-30T12:00:00Z" : null,
          bouncedReason: i === 0 ? "Invalid Address: 550 no such user" : null,
          optedOut: i !== 0,
          optedOutAt: i !== 0 ? "2026-10-29T12:00:00Z" : null,
          optedOutSource: i !== 0 ? "spam" : null,
        })),
      },
    });
  });
  await page.route("**/api/hoa/member-email-status", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    clears.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true, changed: true, recorded: true, recordError: null } });
  });
  await page.goto(`${BASE}/${ORG}/admin/members`, { waitUntil: "networkidle" });
  check(`[members ${mode}] page is in ${mode} mode`, (await isDark(page)) === (mode === "dark"));
  check(`[members ${mode}] real status read answered (available: ${realStatus?.available})`, realStatus && typeof realStatus.available === "boolean");
  check(`[members ${mode}] a Bounced chip (mocked)`, await visible(page, '[data-email-chip="bounced"]'));
  check(`[members ${mode}] an Unsubscribed chip (mocked)`, await visible(page, '[data-email-chip="opted-out"]'));
  const title = await page.locator('[data-email-chip="bounced"]').first().getAttribute("title");
  check(`[members ${mode}] the chip carries the reason`, (title || "").includes("Invalid Address"), title || "");
  await page.screenshot({ path: `${OUT}/p3a-members-${mode}.png` });

  await page.locator('[data-email-chip="bounced"]').first().click();
  check(`[members ${mode}] Clear asks first`, await visibleDialog(page));
  await page.getByRole("button", { name: "Clear Bounce" }).click();
  await page.waitForTimeout(500);
  check(
    `[members ${mode}] Clear POSTs {organizationId, memberId, clear: bounced}`,
    clears[0]?.clear === "bounced" && clears[0]?.memberId === ids[0] && clears[0]?.organizationId === org,
    JSON.stringify(clears[0])
  );
  check(`[members ${mode}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await context.close();
}

// ── The composer's Delivery control ─────────────────────────────────────────
async function runCompose(browser, mode) {
  const { context, page, errors } = await newPage(browser, { mode });
  await signIn(page);
  await page.goto(`${BASE}/${ORG}/admin/communications/compose`, { waitUntil: "networkidle" });
  check(`[compose ${mode}] Delivery control renders`, await visible(page, "[data-email-class]"));
  const tab = (label) => page.locator(`[data-email-class] [role="tab"]`, { hasText: label });
  await page.getByRole("button", { name: "Notice" }).first().click();
  check(`[compose ${mode}] Notice defaults to Essential`, (await tab("Essential").getAttribute("aria-selected")) === "true");
  await page.getByRole("button", { name: "Newsletter" }).first().click();
  check(`[compose ${mode}] Newsletter defaults to Community`, (await tab("Community").getAttribute("aria-selected")) === "true");
  check(`[compose ${mode}] a newsletter can't be Essential`, await tab("Essential").isDisabled());
  check(`[compose ${mode}] says why`, (await textOf(page, "[data-email-class]")).includes("A newsletter is always community."));
  await page.locator("[data-email-class]").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/p3a-compose-${mode}.png` });
  check(`[compose ${mode}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await context.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    await runUnsubscribe(browser, "light");
    await runUnsubscribe(browser, "dark");
    if (SESSION) {
      for (const mode of ["light", "dark"]) {
        await runPreferences(browser, mode);
        await runMembers(browser, mode);
        await runCompose(browser, mode);
      }
    } else {
      console.log("(no --session: signed-in checks skipped)");
    }
  } catch (e) {
    check("script ran to completion", false, e.message.split("\n").slice(0, 6).join(" | "));
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();

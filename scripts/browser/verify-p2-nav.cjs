// Phase 2 browser verification (Round 3): dock, navigation and page titles.
//
//   PORT=3123 node .output/server/index.mjs &          (a built server)
//   NODE_PATH=<dir holding playwright> node scripts/browser/verify-p2-nav.cjs http://localhost:3123 [--session]
//
// Without --session it checks /ui-kit only (no Directus needed). With
// --session it also signs in through POST /api/demo/login (the one-click demo
// account — no password is typed here; the server holds it) and walks the
// workspace on the `demo` org. It CREATES NOTHING: create flows are opened and
// dismissed, never submitted. The one write is the dock-prefs round trip on
// the demo user's own `app_prefs`, restored at the end.
//
// Every context emulates prefers-reduced-transparency: no-preference, because
// a Mac with Reduce Transparency on reports `reduce` to headless Chromium too.
// Screenshots go to $OUT_DIR (default: the OS temp dir), one per mode.
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

async function newPage(browser, { mode = "light", width = 1280, height = 900, reducedMotion = "no-preference" } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: mode, reducedMotion });
  // The workspace's own appearance layer reads localStorage before the media query.
  // And a fresh browser would get the once-per-release "What's new" sheet over
  // the first workspace page; useAppVersion treats an unreadable marker as
  // "seen", so make that one key unreadable.
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

const settle = (page, ms = 700) => page.waitForTimeout(ms);
const isDark = (page) => page.evaluate(() => document.documentElement.classList.contains("dark"));
const alphaOf = (c) => {
  const m = /rgba?\(([^)]+)\)/.exec(c || "");
  if (!m) return 1;
  const p = m[1].split(/[ ,/]+/).filter(Boolean);
  return p.length > 3 ? Number(p[3]) : 1;
};

// The transition the app chose for a navigation: the name the page-transition
// middleware stores for <NuxtPage :transition> (pickPageTransition's answer),
// read once the navigation has landed on `urlPart`. Observing the classes in
// the DOM instead proved racy — a class can come and go between two samples.
async function transitionsDuring(page, fn, urlPart) {
  await fn();
  if (urlPart) await page.waitForURL((u) => u.pathname.endsWith(urlPart), { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await settle(page, 1200);
  return [await transitionName(page)];
}

const transitionName = (page) =>
  page.evaluate(() => document.querySelector("#__nuxt").__vue_app__.$nuxt.payload.state["$spage-transition-name"]);

// ── /ui-kit: the specimens, no session ──────────────────────────────────────
async function runKit(browser, mode) {
  const { context, page, errors } = await newPage(browser, { mode });
  await page.goto(`${BASE}/ui-kit`, { waitUntil: "networkidle" });
  if ((mode === "dark") !== (await isDark(page))) {
    await page.getByRole("button", { name: mode === "dark" ? "Dark" : "Light" }).first().click();
    await settle(page, 300);
  }
  check(`[kit ${mode}] page is in ${mode} mode`, (await isDark(page)) === (mode === "dark"));
  const section = page.locator('[data-kit="nav-system"]');
  check(`[kit ${mode}] Navigation section renders`, await section.isVisible());
  const lib = await page.evaluate(() => {
    const grid = document.querySelector('[data-kit="app-library"] .app-library__grid');
    if (!grid) return null;
    return {
      cols: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
      chips: grid.querySelectorAll(".app-library__item").length,
      anim: getComputedStyle(grid.querySelector(".app-library__item")).animationName,
    };
  });
  check(`[kit ${mode}] App Library is a 4-column grid of the dock's apps`, lib?.cols === 4 && lib?.chips >= 5, JSON.stringify(lib));
  check(`[kit ${mode}] App Library chips enter on apps-chip-in`, lib?.anim === "apps-chip-in", lib?.anim);
  const verbs = await page.locator('[data-kit="create-verbs"] li').count();
  check(`[kit ${mode}] all eleven create verbs listed`, verbs === 11, String(verbs));
  const inline = await section.locator("header.page-header h1").textContent().catch(() => null);
  check(`[kit ${mode}] AppPageHeader renders inline where no outlet listens`, inline?.trim() === "Meetings", inline || "none");
  await page.screenshot({ path: `${OUT}/p2-kit-${mode}.png`, fullPage: false });
  check(`[kit ${mode}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await context.close();
}

// ── The workspace, signed in to the demo org ────────────────────────────────
async function signIn(page) {
  const res = await page.request.post(`${BASE}/api/demo/login`);
  return res.ok();
}

// Sign in the way the app's "Try the demo" button does (POST, then a full
// load), landing straight on an admin page: a hard load of /admin must render
// for a signed-in admin, not redirect to the org root (the server render reads
// memberships with the request's session — useDirectusItems' useRequestFetch).
// After boot the script moves with the router (`spa`), so the navigations it
// checks are the client-side ones.
async function boot(page) {
  const ok = await signIn(page);
  const res = await page.goto(`${BASE}/${ORG}/admin/members`, { waitUntil: "networkidle" });
  return (
    ok &&
    res?.status() === 200 &&
    new URL(page.url()).pathname === `/${ORG}/admin/members` &&
    !!(await page.waitForSelector("[data-app-nav]", { timeout: 8000 }).catch(() => null))
  );
}

const visibleDialog = (page) =>
  page
    .waitForSelector('[role="dialog"]', { state: "visible", timeout: 8000 })
    .then(() => true)
    .catch(() => false);

// A bare router push — no waiting first, so it can land mid-load.
const push = (page, path) =>
  page.evaluate((p) => document.querySelector("#__nuxt").__vue_app__.config.globalProperties.$router.push(p), path);

async function spa(page, path) {
  // Let any navigation still in flight (a page transition, a click's push)
  // land first, so this push is not superseded by it.
  await page.waitForLoadState("networkidle").catch(() => {});
  await settle(page, 400);
  await page.evaluate((p) => document.querySelector("#__nuxt").__vue_app__.config.globalProperties.$router.push(p), path);
  await page.waitForURL((u) => u.pathname === path.split("?")[0], { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await settle(page, 1200);
}

async function runWorkspace(browser, mode) {
  const { context, page, errors } = await newPage(browser, { mode });
  const consoleTail = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") consoleTail.push(`${m.type()}: ${m.text().slice(0, 200)}`);
  });
  check(`[ws ${mode}] demo sign-in`, await boot(page));
  const org = (p) => `/${ORG}${p}`;

  // Page title: registered into the shell's outlet, actions teleported.
  await spa(page, org("/admin/units"));
  check(`[ws ${mode}] page is in ${mode} mode`, (await isDark(page)) === (mode === "dark"));
  const t = await page.evaluate(() => {
    const outlet = document.querySelector("[data-page-title-outlet]");
    return {
      shown: !!outlet && getComputedStyle(outlet).display !== "none",
      title: document.querySelector("[data-page-title-heading]")?.textContent?.trim(),
      inline: document.querySelectorAll("main header.page-header").length,
      actions: document.querySelectorAll("#app-header-actions button, #app-header-actions a").length,
    };
  });
  check(`[ws ${mode}] title lives in the shell outlet`, t.shown && !!t.title && t.inline === 0, JSON.stringify(t));
  check(`[ws ${mode}] page actions teleported into the outlet`, t.actions > 0, String(t.actions));

  // Earned rule + collapse into the Nav's centre.
  const navRule = () =>
    page.evaluate(() => getComputedStyle(document.querySelector("[data-app-nav]")).borderBottomColor);
  check(`[ws ${mode}] Nav hairline hidden at the top`, alphaOf(await navRule()) === 0, await navRule());
  await page.evaluate(() => {
    const pad = document.createElement("div");
    pad.id = "__p2_pad";
    pad.style.height = "2000px";
    // On <body>, never inside <main>: a foreign node in the page container
    // breaks Vue's next page swap (the page never mounts).
    document.body.appendChild(pad);
    window.scrollTo(0, 700);
  });
  await settle(page, 600);
  const collapsed = await page.evaluate(() => {
    const el = document.querySelector("[data-chrome-title]");
    return { opacity: getComputedStyle(el).opacity, text: el.textContent.trim() };
  });
  check(`[ws ${mode}] scrolled: Nav centre carries the title`, collapsed.opacity === "1" && collapsed.text === t.title, JSON.stringify(collapsed));
  check(`[ws ${mode}] scrolled: Nav earns its hairline`, alphaOf(await navRule()) > 0, await navRule());
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page, 600);
  check(
    `[ws ${mode}] back at the top: the title returns`,
    (await page.evaluate(() => getComputedStyle(document.querySelector("[data-chrome-title]")).opacity)) === "0"
  );
  await page.evaluate(() => document.getElementById("__p2_pad")?.remove());

  // "+ New" → Add Unit opens the page's own form and consumes ?new=.
  await page.locator("[data-create-menu]").click();
  await settle(page, 400);
  const verbCount = await page.locator("[data-create-verb]").count();
  check(`[ws ${mode}] + New lists the gated verbs`, verbCount >= 5, String(verbCount));
  await page.locator('[data-create-verb="meeting"]').click();
  // The page opens its form once its own setup resolves — up to ~2s against a
  // remote Directus — so wait for the form, not a fixed beat.
  const meetingSheet = await visibleDialog(page);
  await page.waitForURL((u) => !u.searchParams.has("new"), { timeout: 3000 }).catch(() => {});
  check(`[ws ${mode}] + New → New Meeting opens the meetings form`, meetingSheet, page.url());
  check(`[ws ${mode}] ?new= consumed after opening`, !/[?&]new=/.test(page.url()), page.url());
  await page.keyboard.press("Escape");
  await settle(page, 400);

  // Spotlight's Create group.
  await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
  await page.waitForSelector("[data-spotlight-input]", { timeout: 5000 });
  await page.keyboard.type("add unit");
  await page.waitForSelector('[data-spotlight-verb="unit"]', { timeout: 5000 }).catch(() => {});
  check(`[ws ${mode}] Spotlight offers Add Unit`, await page.locator('[data-spotlight-verb="unit"]').isVisible().catch(() => false));
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/admin\/units/, { timeout: 8000 }).catch(() => {});
  // Spotlight is a dialog too: let it close before looking for the form.
  await page.waitForSelector("[data-spotlight-input]", { state: "hidden", timeout: 3000 }).catch(() => {});
  check(`[ws ${mode}] Spotlight → Add Unit opens the unit form`, await visibleDialog(page), page.url());
  await page.keyboard.press("Escape");
  await settle(page, 400);

  // SubNav: the orphans are reachable.
  await spa(page, org("/admin/communications"));
  const comms = await page.locator("[data-app-subnav] a").allTextContents();
  check(`[ws ${mode}] Comms pills include Polls`, comms.map((s) => s.trim()).includes("Polls"), comms.join(" · "));
  await spa(page, org("/admin/requests"));
  const reqs = await page.locator("[data-app-subnav] a").allTextContents();
  check(`[ws ${mode}] Requests pills include Leads`, reqs.map((s) => s.trim()).includes("Leads"), reqs.join(" · "));

  // Directional transitions: floor strip for a pill, dock order across apps.
  await spa(page, org("/admin/members"));
  let seen = await transitionsDuring(page, () => page.locator("[data-app-subnav] a", { hasText: "Units" }).click(), "/admin/units");
  check(`[ws ${mode}] SubNav Members → Units plays floor-forward`, seen.includes("floor-forward"), seen.join(","));
  seen = await transitionsDuring(page, () => page.locator('.dock-item[aria-label="Money"]').click(), "/admin/payments");
  check(`[ws ${mode}] dock People → Money slides forward`, seen.includes("page-forward"), seen.join(","));
  seen = await transitionsDuring(page, () => page.locator('.dock-item[aria-label="People"]').click(), "/admin/members");
  check(`[ws ${mode}] dock Money → People slides back`, seen.includes("page-back"), seen.join(","));

  // Channels: immersive inside the shell.
  await spa(page, org("/admin/channels"));
  // Async page setup (the channel-access middleware, the org read) resolves
  // against the remote Directus; the first visit in a fresh server is the slow one.
  await page.waitForSelector("[data-channels-workspace]", { timeout: 15000 }).catch(() => {});
  await settle(page, 400);
  const ch = await page.evaluate(() => ({
    workspace: !!document.querySelector("[data-channels-workspace]"),
    footer: !!document.querySelector("footer"),
    dock: (() => {
      const d = document.querySelector(".app-dock");
      return !!d && getComputedStyle(d).display !== "none";
    })(),
    nav: !!document.querySelector("[data-app-nav]"),
    windowScrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
    main: [...(document.querySelector("main")?.children || [])].map((e) => e.className.slice(0, 70)),
    pending: (() => {
      const n = document.querySelector("#__nuxt").__vue_app__.$nuxt;
      const ad = n._asyncData || {};
      return {
        promises: Object.keys(n._asyncDataPromises || {}),
        pendingData: Object.keys(ad).filter((k) => ad[k]?.status?.value === "pending" || ad[k]?.pending?.value),
        hydrating: n.isHydrating,
        route: n.$router?.currentRoute?.value?.fullPath,
      };
    })(),
  }));
  if (!ch.workspace) {
    console.log("   diag:", JSON.stringify(ch.main), JSON.stringify(ch.pending), "| console:", consoleTail.slice(-5).join(" || "));
    console.log("   diag2:", JSON.stringify(await page.evaluate(() => ({
      html: document.querySelector("main")?.innerHTML.slice(0, 300),
      running: document.querySelector("#__nuxt").__vue_app__.$nuxt._runningTransition,
      name: document.querySelector("#__nuxt").__vue_app__.$nuxt.payload.state["$spage-transition-name"],
    }))));
  }
  check(`[ws ${mode}] Channels renders in the shell: nav + dock, no footer`, ch.workspace && ch.nav && ch.dock && !ch.footer, `${page.url()} ${JSON.stringify(ch)}`);
  check(`[ws ${mode}] Channels is immersive (the window does not scroll)`, !ch.windowScrolls);
  await page.screenshot({ path: `${OUT}/p2-channels-${mode}.png` });
  await spa(page, org("/admin/communications/channels"));
  await page.waitForSelector("[data-channels-workspace]", { timeout: 15000 }).catch(() => {});
  check(`[ws ${mode}] Comms hub embeds the same channels workspace`, await page.locator("[data-channels-workspace]").isVisible());

  // Navigating again while the page on screen is still loading must never
  // strand an empty <main> (out-in + Nuxt's Suspense re-key — see PAGE_CUT in
  // core/shared/nav/page-transition.ts). Push, then push again 30–141ms later,
  // before the first page's setup has resolved against Directus.
  const races = [
    ["/admin/payments", "/admin/channels"],
    ["/admin/units", "/admin/members"],
    ["/admin/meetings", "/admin/payments"],
    ["/admin/members", "/admin/units"],
  ];
  const raced = [];
  for (const [i, [a, b]] of races.entries()) {
    await push(page, org(a));
    await page.waitForTimeout(30 + i * 37);
    await push(page, org(b));
    await page.waitForURL((u) => u.pathname === org(b), { timeout: 15000 }).catch(() => {});
    const name = await transitionName(page);
    await page.waitForLoadState("networkidle").catch(() => {});
    await settle(page, 1500);
    const filled = await page.evaluate(() =>
      [...(document.querySelector("main")?.children || [])].some((c) => c.getBoundingClientRect().height > 40)
    );
    raced.push(`${a}→${b}:${name}:${filled ? "ok" : "BLANK"}`);
  }
  check(`[ws ${mode}] navigating mid-load never blanks <main>`, raced.every((r) => r.endsWith(":ok")), raced.join(" "));
  check(`[ws ${mode}] a mid-load navigation cuts instead of animating`, raced.some((r) => r.includes(":page-cut:")), raced.join(" "));

  await spa(page, org("/admin/units"));
  await page.screenshot({ path: `${OUT}/p2-units-${mode}.png` });
  check(`[ws ${mode}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await context.close();
}

// ── Below md: the App Library replaces the dock ─────────────────────────────
async function runPhone(browser, mode) {
  const { context, page, errors } = await newPage(browser, { mode, width: 390, height: 844 });
  await boot(page);
  await spa(page, `/${ORG}/admin/members`);
  const dockShown = await page.evaluate(() => {
    const d = document.querySelector(".app-dock");
    return !!d && getComputedStyle(d).display !== "none";
  });
  check(`[phone ${mode}] no dock below md`, !dockShown);
  await page.locator("[data-app-library-trigger]").click();
  await page.waitForSelector("[data-app-library].is-open", { timeout: 4000 }).catch(() => {});
  const lib = await page.evaluate(() => {
    const p = document.querySelector("[data-app-library]");
    const g = p?.querySelector(".app-library__grid");
    return p && {
      open: p.classList.contains("is-open"),
      cols: getComputedStyle(g).gridTemplateColumns.split(" ").length,
      chips: g.querySelectorAll(".app-library__item").length,
      staggering: g.classList.contains("is-entering"),
    };
  });
  check(`[phone ${mode}] grid button opens the App Library, 4 across`, lib?.open && lib?.cols === 4 && lib?.chips >= 5, JSON.stringify(lib));
  await settle(page, 900);
  check(`[phone ${mode}] the stagger switches itself off`, !(await page.evaluate(() => document.querySelector("[data-app-library] .app-library__grid")?.classList.contains("is-entering"))));
  await page.screenshot({ path: `${OUT}/p2-library-${mode}.png` });
  await page.keyboard.press("Escape");
  await settle(page, 400);
  check(`[phone ${mode}] Esc closes it`, (await page.locator("[data-app-library]").count()) === 0);
  await page.locator("[data-app-library-trigger]").click();
  await settle(page, 600);
  await page.locator('[data-app-library-app="payments"]').click();
  await page.waitForURL(/\/admin\/payments/, { timeout: 8000 }).catch(() => {});
  // The panel closes on the route change the layout sees, which commits once
  // the incoming page has resolved — a moment after the URL changes.
  await page.waitForSelector("[data-app-library]", { state: "detached", timeout: 8000 }).catch(() => {});
  check(`[phone ${mode}] tapping an app navigates and closes`, /\/admin\/payments/.test(page.url()) && (await page.locator("[data-app-library]").count()) === 0, page.url());
  check(`[phone ${mode}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await context.close();
}

// ── Reduced motion and the dock prefs round trip ────────────────────────────
async function runPrefs(browser) {
  const { context, page } = await newPage(browser, { width: 390, height: 844, reducedMotion: "reduce" });
  await boot(page);
  await spa(page, `/${ORG}/admin/members`);
  await page.locator("[data-app-library-trigger]").click();
  await settle(page, 300);
  const anim = await page.evaluate(() => {
    const it = document.querySelector("[data-app-library] .app-library__item");
    return it ? getComputedStyle(it).animationName : null;
  });
  check("[rm] App Library chips do not stagger", anim === "none", anim);
  await context.close();

  // Dock prefs follow the user: PATCH, then a fresh device (empty localStorage) reads them back.
  const a = await newPage(browser);
  await signIn(a.page);
  const before = await (await a.page.request.get(`${BASE}/api/user/app-prefs`)).json();
  if (!before.available) {
    const r = await a.page.request.patch(`${BASE}/api/user/app-prefs`, { data: { dock: { labels: true } } });
    check("[prefs] field not provisioned: PATCH 503s and GET degrades", r.status() === 503 && before.available === false, `status ${r.status()}`);
    await a.context.close();
    return;
  }
  const original = before.prefs?.dock?.labels ?? false;
  const r = await a.page.request.patch(`${BASE}/api/user/app-prefs`, { data: { dock: { labels: !original }, role: "x" } });
  check("[prefs] PATCH writes the session user's dock prefs", r.ok(), `status ${r.status()}`);
  await a.context.close();

  const b = await newPage(browser);
  await boot(b.page);
  await spa(b.page, `/${ORG}/admin/members`);
  const labels = await b.page.evaluate(() => !!document.querySelector(".app-dock--labels"));
  check("[prefs] a fresh device paints the account's dock prefs", labels === !original, `labels=${labels}`);
  const restore = await b.page.request.patch(`${BASE}/api/user/app-prefs`, { data: { dock: { labels: original } } });
  check("[prefs] restored the demo user's original value", restore.ok());
  await b.context.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    await runKit(browser, "light");
    await runKit(browser, "dark");
    if (SESSION) {
      await runWorkspace(browser, "light");
      await runWorkspace(browser, "dark");
      await runPhone(browser, "light");
      await runPhone(browser, "dark");
      await runPrefs(browser);
    } else {
      console.log("(no --session: workspace checks skipped)");
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

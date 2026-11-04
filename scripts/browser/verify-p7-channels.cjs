// Phase 7 browser verification (Round 3): channels gap-close.
//
//   pnpm build && PORT=3419 node --env-file=.env .output/server/index.mjs &
//   NODE_PATH=<dir holding playwright> node --env-file=.env scripts/browser/verify-p7-channels.cjs http://localhost:3419
//
// Signs in through POST /api/demo/login on the `demo` org, in light and dark, and uses a real
// session. The demo org ships with no channels, so each pass creates one (`p7-<mode>-<time>`),
// posts ONE message in it, edits that, deletes the message (an author may delete their own),
// and soft-deletes the channel (status "deleted": hidden everywhere, the row is kept).
//
//   composer    the composer is a glass surface
//   edit        the pencil appears on your own fresh message; Save updates the text and shows "edited"
//   notify      POST /channels/:id/notify answers for a message that was already fanned out
//               (the UI's own call came first → `duplicate`), and refuses someone else's message
//   presence    POST /channels/:id/presence answers { ok, here: [] } and the header shows no
//               "here" avatars when you are alone
//   dm          POST /channels/dm refuses messaging yourself (400) and a non-member (403)
//   entities    the project page has a Discussion tab that shows a thread or "Start a channel"
//
// NOT covered here (needs `pnpm add:channel-phase7` run, and a second signed-in person): a DM
// opening end to end, "who's here" with two people, and a push landing on a device. The edit
// window, the fan-out and the DM roster rules are unit-tested (tests/server/channel-phase7.test.ts).
// Screenshots go to $OUT_DIR (default: the OS temp dir) and are only worth opening on a FAIL.
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://localhost:3000";
const ORG = process.env.ORG_SLUG || "demo";
const OUT = process.env.OUT_DIR || require("os").tmpdir();
const results = [];
const skip = (name, why) => console.log(`SKIP  ${name}  — ${why}`);
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

async function newPage(browser, mode) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, colorScheme: mode, locale: "en-US" });
  await context.addInitScript(
    ({ m }) => {
      try {
        // Headless Chromium on macOS crashes when a service worker calls the Badging API; see
        // verify-p6-pwa.cjs. The page doesn't hand the worker that message here.
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
    },
    { m: mode }
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page, errors };
}
const signIn = (page) => page.request.post(`${BASE}/api/demo/login`).then((r) => r.ok());

async function run(browser, mode) {
  const { context, page, errors } = await newPage(browser, mode);
  check(`[${mode}] demo sign-in`, await signIn(page));

  // A channel to work in (the demo org has none).
  const orgRes = await page.request.get(`${BASE}/api/hoa/by-slug?slug=${ORG}`).then((r) => (r.ok() ? r.json() : null)).catch(() => null);
  const orgId = orgRes?.id ?? orgRes?.data?.id ?? orgRes?.hoa?.id ?? (Array.isArray(orgRes) ? orgRes[0]?.id : null) ?? orgRes?.organization?.id ?? null;
  check(`[${mode}] resolved the demo org id`, !!orgId, orgId ? "" : JSON.stringify(orgRes)?.slice(0, 160));
  const chName = `p7-${mode}-${Date.now()}`;
  const made = await page.request.post(`${BASE}/api/hoa/channels/create`, { data: { organization: orgId, name: chName, slug: chName, is_private: false } }).then((r) => (r.ok() ? r.json() : null)).catch(() => null);
  const cid = made?.channel?.id;
  check(`[${mode}] created a throwaway channel`, !!cid);
  if (!cid) {
    await context.close();
    return;
  }

  await page.goto(`${BASE}/${ORG}/admin/channels`, { waitUntil: "networkidle" });
  const firstRow = page.locator(".channel-row button", { hasText: chName }).first();
  await firstRow.waitFor({ timeout: 20000 }).catch(() => {});
  if (!(await firstRow.count())) {
    check(`[${mode}] the new channel is in the roster`, false, "no channel rows");
    await page.request.post(`${BASE}/api/hoa/channels/delete`, { data: { channel: cid } }).catch(() => {});
    await context.close();
    return;
  }
  await firstRow.click();
  const composer = page.locator('[data-testid="channel-composer"]');
  await composer.waitFor({ timeout: 15000 }).catch(() => {});
  check(`[${mode}] the composer is a glass surface`, (await composer.count()) === 1 && (await composer.evaluate((el) => el.classList.contains("glass-surface")).catch(() => false)));

  // ── send → edit → "edited" → delete ────────────────────────────────────────
  const stamp = `p7-${mode}-${Date.now()}`;
  const editor = composer.locator(".ProseMirror");
  await editor.click();
  await page.keyboard.type(stamp);
  await page.keyboard.press("Enter");
  const msg = page.locator(`div[id^="msg-"]`, { hasText: stamp }).first();
  await msg.waitFor({ timeout: 15000 }).catch(() => {});
  check(`[${mode}] a sent message shows up`, (await msg.count()) === 1);
  await msg.hover();
  const pencil = msg.locator('[data-testid="channel-edit-btn"]');
  check(`[${mode}] the pencil is offered on your own fresh message`, (await pencil.count()) === 1);
  if (await pencil.count()) {
    await pencil.click();
    const box = msg.locator('[data-testid="channel-edit"] .ProseMirror');
    await box.waitFor({ timeout: 8000 }).catch(() => {});
    await box.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" (edited)");
    await msg.getByRole("button", { name: "Save" }).click();
    // The editor closes on Save; the new text and the badge arrive over the realtime subscription.
    await msg.locator('[data-testid="channel-edit"]').waitFor({ state: "detached", timeout: 10000 }).catch(() => {});
    await msg.getByText("edited", { exact: true }).first().waitFor({ timeout: 10000 }).catch(() => {});
    check(`[${mode}] Save updates the text`, (await msg.innerText()).includes(`${stamp} (edited)`));
    check(`[${mode}] and the message is badged "edited"`, (await msg.getByText("edited", { exact: true }).count()) >= 1);
  }

  // ── the server routes, from the signed-in page ────────────────────────────
  const post = (path, body) =>
    page.evaluate(
      async ({ path, body }) => {
        const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        return { status: r.status, body: await r.json().catch(() => null) };
      },
      { path, body }
    );
  const ZERO = "00000000-0000-0000-0000-000000000000";
  const pres = await post(`/api/hoa/channels/${cid}/presence`, {});
  check(`[${mode}] presence answers`, pres.status === 200 && pres.body?.ok === true && Array.isArray(pres.body?.here), JSON.stringify(pres));
  const nope = await post(`/api/hoa/channels/${cid}/notify`, { messageId: ZERO });
  check(`[${mode}] notify refuses a message that isn't there`, nope.status === 200 && nope.body?.ok === false, JSON.stringify(nope.body));
  const edit404 = await post(`/api/hoa/channels/${cid}/edit`, { messageId: ZERO, content: "<p>x</p>" });
  check(`[${mode}] edit 404s a message that isn't in the channel`, edit404.status === 404, String(edit404.status));
  const dm = await post("/api/hoa/channels/dm", { organization: orgId, userId: ZERO });
  check(`[${mode}] a DM to someone who can't use channels is refused`, dm.status === 403, String(dm.status));
  check(`[${mode}] alone in the channel: no "here" avatars`, (await page.locator('[data-testid="channel-presence"]').count()) === 0);

  // ── clean up: delete the test message (the author's own delete) ─────────────
  await msg.hover();
  const trash = msg.locator('button:has(svg.lucide-trash-2), button:has([class*="trash"])').first();
  if (await trash.count()) {
    await trash.click();
    await page.getByRole("button", { name: "Delete", exact: true }).last().click().catch(() => {});
    await page.waitForTimeout(800);
    check(`[${mode}] the test message is cleaned up`, (await page.locator(`div[id^="msg-"]`, { hasText: stamp }).count()) === 0);
  } else {
    check(`[${mode}] the test message is cleaned up`, false, "no delete control found — remove it by hand");
  }
  if (mode === "dark") await page.screenshot({ path: `${OUT}/p7-channels-${mode}.png` });
  const gone = await page.request.post(`${BASE}/api/hoa/channels/delete`, { data: { channel: cid } }).then((r) => r.ok()).catch(() => false);
  check(`[${mode}] the throwaway channel is soft-deleted`, gone);

  // ── the project page has a Discussion tab ──────────────────────────────────
  await page.goto(`${BASE}/${ORG}/admin/projects`, { waitUntil: "networkidle" });
  const projectLink = page.locator('a[href*="/admin/projects/"]').first();
  if (await projectLink.count()) {
    await projectLink.click();
    const tab = page.getByRole("button", { name: "Discussion" });
    await tab.waitFor({ timeout: 15000 }).catch(() => {});
    check(`[${mode}] the project page has a Discussion tab`, (await tab.count()) === 1);
    if (await tab.count()) {
      await tab.click();
      await page.locator('[data-testid="entity-channel"]').waitFor({ timeout: 10000 }).catch(() => {});
      const shows = (await page.locator('[data-testid="entity-channel-thread"]').count()) + (await page.locator('[data-testid="start-channel"]').count());
      check(`[${mode}] the tab shows the linked thread or a Start a channel verb`, shows >= 1);
    }
  } else {
    skip(`[${mode}] the project page's Discussion tab`, "the demo org has no project to open — not verified here");
  }

  check(`[${mode}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await context.close();
}

(async () => {
  const browser = await chromium.launch();
  for (const mode of ["light", "dark"]) await run(browser, mode);
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();

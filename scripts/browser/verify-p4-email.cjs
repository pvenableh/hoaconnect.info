// Phase 4 browser verification (Round 3): auto-pause + Resume, the recurrence
// sentence, and the Branding card's live preview.
//
//   pnpm build && PORT=3123 node --env-file=.env .output/server/index.mjs &
//   NODE_PATH=<dir holding playwright> node --env-file=.env scripts/browser/verify-p4-email.cjs http://localhost:3123
//
// Signs in through POST /api/demo/login (the one-click demo account — no
// password is typed here) on the `demo` org, in light and in dark:
//
//   paused    writes one paused email on `demo` with Directus (the static
//             token): queued rows for the org's members and the health record a
//             pause leaves. Opens its detail page: "Paused · too many bounces",
//             the sentence, Resume. Presses Resume (POST /api/email/:id/resume,
//             for real), then drives the tick (GET /api/email/cron/continue-sends
//             with CRON_SECRET) until the dialog says Sent. The demo guard in
//             sendOrganizationEmail means no mail leaves. Then deletes the email
//             and its rows.
//   repeat    the composer's Repeat picker for Tue Nov 10 2026, 9:00 AM in New
//             York: "Monthly on the second Tuesday" and its sentence. Nothing is
//             saved.
//   branding  Settings → Organization → Branding: the preview iframe loads
//             GET /api/email/preview-mjml, follows the type picker (incl. a
//             notification), and is sandboxed.
//
// Snapshots of `demo` and `demo-classic` (hashed, read only) must be identical
// before and after. Screenshots go to $OUT_DIR (default: the OS temp dir).
const { chromium } = require("playwright");
const crypto = require("crypto");
const BASE = process.argv[2] || "http://localhost:3000";
const ORG = process.env.ORG_SLUG || "demo";
const OUT = process.env.OUT_DIR || require("os").tmpdir();
const DIRECTUS = process.env.DIRECTUS_URL;
const TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const SECRET = process.env.CRON_SECRET;
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

// ── Directus ────────────────────────────────────────────────────────────────
async function d(path, init = {}) {
  const res = await fetch(`${DIRECTUS}${path}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text().catch(() => "")}`);
  return res.status === 204 ? null : (await res.json()).data;
}
const hash = (v) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
async function snapshot(slug) {
  const org = (await d(`/items/hoa_organizations?filter[slug][_eq]=${slug}&fields=id,slug&limit=1`))[0];
  if (!org) return { slug, missing: true };
  const q = (c, f, filter) => d(`/items/${c}?filter${filter}=${org.id}&fields=${f}&sort=id&limit=-1`);
  const [members, emails, recipients, activity] = await Promise.all([
    q("hoa_members", "*", "[organization][_eq]"),
    q("hoa_emails", "*", "[organization][_eq]"),
    q("hoa_email_recipients", "*", "[email][organization][_eq]"),
    q("hoa_email_activity", "*", "[organization][_eq]"),
  ]);
  return {
    slug,
    counts: { members: members.length, emails: emails.length, recipients: recipients.length },
    hashes: { members: hash(members), emails: hash(emails), recipients: hash(recipients), activity: hash(activity) },
  };
}

/** One paused send on the org: the email, its queued rows, the health record. */
async function createPausedEmail(mode) {
  const org = (await d(`/items/hoa_organizations?filter[slug][_eq]=${ORG}&fields=id&limit=1`))[0];
  const members = await d(`/items/hoa_members?filter[organization][_eq]=${org.id}&filter[email][_nnull]=true&fields=id,email,first_name,last_name&limit=-1`);
  const now = new Date().toISOString();
  const runKey = `m:${now}`;
  const counts = { delivered: 46, hardBounces: 4, spamReports: 0 };
  const sentence = "4 of 50 messages bounced (8%; the limit is 8%). Nobody else gets it until you resume the send.";
  const email = await d(`/items/hoa_emails`, {
    method: "POST",
    body: JSON.stringify({
      organization: org.id,
      subject: `Phase 4 pause check (${mode}) ${now}`,
      content: "<p>Hello — Phase 4 pause check.</p>",
      email_type: "notice",
      email_class: "essential",
      status: "paused",
      send_run_key: runKey,
      send_started_at: now,
      total_recipients: members.length,
      send_errors: { health: { state: "paused", reason: "bounces", at: now, runKey, counts, baseline: null, sentence } },
    }),
  });
  await d(`/items/hoa_email_recipients`, {
    method: "POST",
    body: JSON.stringify(
      members.map((m, i) => ({
        email: email.id,
        run_key: runKey,
        kind: "member",
        position: i + 1,
        dedupe_key: `${email.id}:${runKey}:m:${m.id}`,
        member: m.id,
        recipient_email: m.email,
        recipient_name: [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email,
        status: "queued",
        member_fields: { first_name: m.first_name || "" },
      }))
    ),
  });
  return { id: email.id, rows: members.length, sentence };
}
async function removeEmail(id) {
  const rows = await d(`/items/hoa_email_recipients?filter[email][_eq]=${id}&fields=id&limit=-1`);
  if (rows.length) await d(`/items/hoa_email_recipients`, { method: "DELETE", body: JSON.stringify(rows.map((r) => r.id)) });
  const leases = await d(`/items/hoa_email_send_leases?filter[email][_eq]=${id}&fields=id&limit=-1`).catch(() => []);
  if (leases.length) await d(`/items/hoa_email_send_leases`, { method: "DELETE", body: JSON.stringify(leases.map((r) => r.id)) });
  await d(`/items/hoa_emails/${id}`, { method: "DELETE" });
}

// ── Page helpers ────────────────────────────────────────────────────────────
async function newPage(browser, mode) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: mode, timezoneId: "America/New_York", locale: "en-US" });
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
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page, errors };
}
const signIn = (page) => page.request.post(`${BASE}/api/demo/login`).then((r) => r.ok());
const text = (loc) => loc.first().textContent({ timeout: 5000 }).then((t) => (t || "").trim()).catch(() => "");

async function checkPaused(page, mode, created) {
  await page.goto(`${BASE}/${ORG}/admin/communications/${created.id}`, { waitUntil: "networkidle" });
  const card = page.locator('[data-testid="detail-send-progress"]');
  const label = card.locator('[data-testid="send-progress-label"]');
  await label.waitFor({ timeout: 15000 }).catch(() => {});
  check(`[${mode}] the detail page says Paused · too many bounces`, (await text(label)) === "Paused · too many bounces", await text(label));
  check(`[${mode}] the sentence says why`, (await text(card.locator('[data-testid="send-progress-health"]'))).includes(created.sentence));
  const resume = card.locator('[data-testid="send-progress-resume"]');
  check(`[${mode}] Resume is offered`, await resume.isVisible().catch(() => false));
  await page.screenshot({ path: `${OUT}/p4-paused-${mode}.png` });
  const fg = await label.evaluate((el) => getComputedStyle(el).color).catch(() => "");
  check(`[${mode}] the label is legible`, mode === "dark" ? !/rgb\(\s*(\d|[1-9]\d)\s*,/.test(fg) : true, fg);

  const resumed = page.waitForResponse((r) => r.url().endsWith(`/api/email/${created.id}/resume`), { timeout: 15000 }).catch(() => null);
  await resume.click();
  const res = await resumed;
  check(`[${mode}] Resume → 200 from the resume route`, !!res && res.status() === 200, res ? String(res.status()) : "no response");
  const after = await d(`/items/hoa_emails/${created.id}?fields=status,send_errors`);
  check(`[${mode}] the email is sending again, with a baseline`, after.status === "sending" || after.status === "sent", JSON.stringify(after.send_errors?.health?.state ?? after.status));

  const seen = [];
  const deadline = Date.now() + 90000;
  let lastKick = 0;
  while (Date.now() < deadline) {
    if (Date.now() - lastKick > 5000) {
      lastKick = Date.now();
      await page.request.get(`${BASE}/api/email/cron/continue-sends`, { headers: { "x-cron-secret": SECRET } }).catch(() => null);
    }
    const l = await text(label);
    if (l && seen[seen.length - 1] !== l) seen.push(l);
    if (l.startsWith("Sent") || l.startsWith("Not sent")) break;
    await page.waitForTimeout(500);
  }
  check(`[${mode}] after Resume the tick finishes it: Sent`, (seen.at(-1) || "").startsWith("Sent"), seen.join(" → "));
  const rows = await d(`/items/hoa_email_recipients?filter[email][_eq]=${created.id}&fields=status&limit=-1`);
  check(`[${mode}] every row settled; none left queued or claimed`, rows.length === created.rows && rows.every((r) => !["queued", "claimed"].includes(r.status)), rows.map((r) => r.status).join(","));
}

async function checkRepeat(page, mode) {
  await page.goto(`${BASE}/${ORG}/admin/communications/compose`, { waitUntil: "networkidle" });
  // Centre each control first: the dock and the view switcher are fixed to
  // the bottom of the viewport, and a control scrolled to the edge sits under them.
  const centred = async (loc) => {
    await loc.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await loc.click();
  };
  await centred(page.getByRole("switch", { name: "Schedule for later" }));
  // `#sched-at` is the date field's hidden native input; its segments are siblings.
  const field = page.locator('div:has(> label[for="sched-at"])');
  await field.getByRole("spinbutton").first().waitFor({ timeout: 10000 });
  // Typing into the date segments can race the field's mount; type until the
  // date takes (the nth-weekday choice appears once it has).
  let options = [];
  for (let attempt = 0; attempt < 3 && !options.includes("Monthly on the second Tuesday"); attempt++) {
    await centred(field.getByRole("spinbutton").first());
    await page.keyboard.type("11102026", { delay: 30 });
    await page.keyboard.type("0900", { delay: 30 });
    await page.keyboard.type("A");
    await page.waitForFunction(() => document.querySelectorAll("#sched-repeat option").length > 7, null, { timeout: 3000 }).catch(() => {});
    options = await page.locator("#sched-repeat option").allTextContents();
  }
  check(`[${mode}] Repeat offers "Monthly on the second Tuesday"`, options.includes("Monthly on the second Tuesday"), options.join(" | "));
  await page.locator("#sched-repeat").selectOption({ label: "Monthly on the second Tuesday" });
  const sentence = await text(page.locator('[data-testid="repeat-sentence"]'));
  check(
    `[${mode}] the sentence under the picker`,
    sentence === "Every second Tuesday of the month at 9:00 AM — first on Tue, Nov 10, then Tue, Dec 8.",
    sentence
  );
  await page.locator("#sched-repeat").screenshot({ path: `${OUT}/p4-repeat-${mode}.png` }).catch(() => {});
}

async function checkBranding(page, mode) {
  await page.goto(`${BASE}/${ORG}/admin/settings/organization?tab=branding`, { waitUntil: "networkidle" });
  const iframe = page.locator('[data-testid="branding-email-preview"]');
  await iframe.waitFor({ timeout: 15000 }).catch(() => {});
  const src = (await iframe.getAttribute("src").catch(() => "")) || "";
  check(`[${mode}] the preview iframe loads GET /api/email/preview-mjml`, src.startsWith("/api/email/preview-mjml?") && src.includes("template=notice"), src.slice(0, 120));
  check(`[${mode}] the iframe is sandboxed`, (await iframe.getAttribute("sandbox")) === "");
  const frame = page.frameLocator('[data-testid="branding-email-preview"]');
  const body = await frame.locator("body").innerText({ timeout: 15000 }).catch(() => "");
  check(`[${mode}] the preview renders the sample in the org's template`, body.includes("A sample message") || body.includes("Your headings look like this"), body.slice(0, 80).replace(/\s+/g, " "));
  // The settings form can re-render once its data lands (resetting the picker),
  // so pick until the iframe follows.
  for (let attempt = 0; attempt < 3; attempt++) {
    const reloaded = page.waitForResponse((r) => r.url().includes("/api/email/preview-mjml?") && r.url().includes("template=notification"), { timeout: 5000 }).catch(() => null);
    await page.locator("#emailPreviewType").selectOption("notification");
    if (await reloaded) break;
  }
  const nsrc = (await iframe.getAttribute("src").catch(() => "")) || "";
  // Read the frame whose document IS the notification preview (a locator on the
  // iframe element can still see the previous document mid-navigation).
  let nbody = "";
  for (const until = Date.now() + 15000; Date.now() < until && !nbody.includes("A task was assigned to you"); ) {
    const f = page.frames().find((fr) => fr.url().includes("template=notification"));
    if (f) nbody = await f.locator("body").innerText({ timeout: 1000 }).catch(() => "");
    if (!nbody.includes("A task was assigned to you")) await page.waitForTimeout(250);
  }
  check(`[${mode}] picking Notification previews the notification email`, nsrc.includes("template=notification") && nsrc.includes("category=task") && nbody.includes("A task was assigned to you"), nsrc.slice(0, 120));
  const direct = await page.request.get(`${BASE}${nsrc}`);
  check(`[${mode}] the route answers with a sandbox CSP`, direct.headers()["content-security-policy"] === "sandbox", direct.headers()["content-security-policy"] || "none");
  await iframe.screenshot({ path: `${OUT}/p4-branding-${mode}.png` }).catch(() => {});
}

(async () => {
  if (!DIRECTUS || !TOKEN || !SECRET) {
    console.log("DIRECTUS_URL, DIRECTUS_STATIC_TOKEN and CRON_SECRET are needed (node --env-file=.env …)");
    process.exit(2);
  }
  const before = await Promise.all([snapshot("demo"), snapshot("demo-classic")]);
  const browser = await chromium.launch();
  const created = [];
  try {
    for (const mode of ["light", "dark"]) {
      const { context, page, errors } = await newPage(browser, mode);
      check(`[${mode}] signed in to the demo org`, await signIn(page));
      const paused = await createPausedEmail(mode);
      created.push(paused.id);
      await checkPaused(page, mode, paused).catch((e) => check(`[${mode}] paused check ran`, false, e.message.split("\n")[0]));
      await checkRepeat(page, mode).catch((e) => check(`[${mode}] repeat check ran`, false, e.message.split("\n")[0]));
      await checkBranding(page, mode).catch((e) => check(`[${mode}] branding check ran`, false, e.message.split("\n")[0]));
      check(`[${mode}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
      await context.close();
    }
  } catch (e) {
    check("script ran to completion", false, e.message.split("\n").slice(0, 4).join(" | "));
  } finally {
    await browser.close();
    for (const id of created) await removeEmail(id).catch((e) => check(`[cleanup] removed ${id}`, false, e.message));
  }
  const after = await Promise.all([snapshot("demo"), snapshot("demo-classic")]);
  for (let i = 0; i < 2; i++) {
    check(`[snapshot] ${before[i].slug} identical before and after (cleanup done)`, JSON.stringify(before[i]) === JSON.stringify(after[i]), JSON.stringify(after[i].counts));
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();

// Phase 3b browser verification (Round 3): the send queue's progress UI.
//
//   pnpm build && PORT=3123 node .output/server/index.mjs &      (the project's .env)
//   NODE_PATH=<dir holding playwright> node --env-file=.env scripts/browser/verify-p3b-queue.cjs http://localhost:3123 [--real]
//
// Signs in through POST /api/demo/login (the one-click demo account — no
// password is typed here) on the `demo` org, opens the composer and sends to
// 60 people, then watches the send dialog go Getting ready → Sending → Sent and
// checks that the numbers it shows are the aggregate's. Also: the comms dock
// badge while a send is in flight, and the dialog in light and dark.
//
// Two modes:
//   default   the queue's schema may not exist yet (`pnpm add:email-send-queue`
//             is an operator step), so /api/email/save, /api/email/send and
//             the progress route are answered by page.route with a scripted
//             60-person send — every check says "(mocked)". It WRITES NOTHING:
//             snapshots of `demo` and `demo-classic` (hashed) must be
//             identical before and after.
//   --real    after the script has run. Nothing on the server side is
//             intercepted: the send is enqueued for real (the demo guard in
//             sendOrganizationEmail means no mail leaves — rows settle `sent`
//             with no message id) and the tick is driven by calling
//             GET /api/email/cron/continue-sends with CRON_SECRET, as Vercel
//             Cron would. The dialog's final numbers are compared with a
//             Directus aggregate of the rows. Then it deletes the email and
//             its rows (the static token) and asserts both orgs' snapshots
//             are identical again.
//
// Snapshots read Directus with DIRECTUS_URL + DIRECTUS_STATIC_TOKEN (read
// only). Screenshots go to $OUT_DIR (default: the OS temp dir).
const { chromium } = require("playwright");
const crypto = require("crypto");
const BASE = process.argv[2] || "http://localhost:3000";
const REAL = process.argv.includes("--real");
const ORG = process.env.ORG_SLUG || "demo";
const OUT = process.env.OUT_DIR || require("os").tmpdir();
const DIRECTUS = process.env.DIRECTUS_URL;
const TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

// ── Snapshots (read-only) ───────────────────────────────────────────────────
async function d(path, init = {}) {
  const res = await fetch(`${DIRECTUS}${path}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" } });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.status === 204 ? null : (await res.json()).data;
}
/** --real cleanup: the one email this run created, and its rows. */
async function removeEmail(id) {
  const rows = await d(`/items/hoa_email_recipients?filter[email][_eq]=${id}&fields=id&limit=-1`);
  if (rows.length) await d(`/items/hoa_email_recipients`, { method: "DELETE", body: JSON.stringify(rows.map((r) => r.id)) });
  await d(`/items/hoa_emails/${id}`, { method: "DELETE" });
}
const hash = (v) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
async function snapshot(slug) {
  const org = (await d(`/items/hoa_organizations?filter[slug][_eq]=${slug}&fields=id,slug&limit=1`))[0];
  if (!org) return { slug, missing: true };
  const q = (c, f, filter) => d(`/items/${c}?filter${filter}=${org.id}&fields=${f}&sort=id&limit=-1`);
  const [members, emails, recipients, activity, ledger] = await Promise.all([
    q("hoa_members", "*", "[organization][_eq]"),
    q("hoa_emails", "*", "[organization][_eq]"),
    q("hoa_email_recipients", "*", "[email][organization][_eq]"),
    q("hoa_email_activity", "*", "[organization][_eq]"),
    q("hoa_ledger_entries", "id,date_updated", "[organization][_eq]").catch(() => []),
  ]);
  return {
    slug,
    counts: { members: members.length, emails: emails.length, recipients: recipients.length },
    emailIds: emails.map((e) => e.id),
    recipientIds: recipients.map((r) => r.id),
    hashes: { members: hash(members), emails: hash(emails), recipients: hash(recipients), activity: hash(activity), ledger: hash(ledger) },
  };
}

// ── Page helpers ────────────────────────────────────────────────────────────
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
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "no-preference" }] });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { context, page, errors };
}
const signIn = (page) => page.request.post(`${BASE}/api/demo/login`).then((r) => r.ok());
const commsBadge = (page) =>
  page.locator('[aria-label="Communications"] .dock-item__badge').first().textContent({ timeout: 1500 })
    .then((t) => (t || "").trim()).catch(() => "");
const labelOf = (page) =>
  page.locator('[data-testid="send-progress-dialog"] [data-testid="send-progress-label"]').first().textContent().then((t) => (t || "").trim()).catch(() => "");

/** Fill the composer and press Send to N members. */
async function composeAndSend(page, subject) {
  await page.goto(`${BASE}/${ORG}/admin/communications/compose`, { waitUntil: "networkidle" });
  // Notice = essential: no unsubscribe tokens are minted, so a --real run
  // writes nothing to the members it sends to.
  await page.getByRole("button", { name: "Notice" }).first().click();
  await page.locator("#subject").fill(subject);
  const editor = page.locator(".ProseMirror").first();
  await editor.click();
  await page.keyboard.type("Hello {{first_name}} — Phase 3b queue check.");
  const send = page.getByRole("button", { name: /^Send to \d+ member/ }).first();
  const label = ((await send.textContent()) || "").trim();
  await send.click();
  return label;
}

// ── The scripted send (default mode) ────────────────────────────────────────
const TOTAL = 60;
const frame = (o) => ({
  status: "sending", phase: "sending", total: TOTAL, sent: 0, failed: 0, unknown: 0, suppressed: 0,
  queued: 0, claimed: 0, rows: 0, stalled: null, updatedAt: null, errors: [], provisioned: true, ...o,
});
const SCRIPT = [
  frame({ phase: "preparing", total: null, queued: 24, rows: 24 }),
  frame({ phase: "sending", sent: 27, failed: 1, suppressed: 2, queued: 32, rows: 62 }),
  frame({ status: "sent", phase: "done", sent: 57, failed: 1, unknown: 2, suppressed: 2, rows: 62,
    errors: [{ address: "x•••y@example.com", reason: "400: invalid" }, { address: "a•••b@example.com", reason: "unknown" }] }),
];
const EXPECTED = ["Getting ready · 24 people", "Sending · 28 of 60 · 2 held back", "Sent · 57 accepted, 1 failed, 2 unknown"];

async function runMocked(browser, mode) {
  const { context, page, errors } = await newPage(browser, { mode });
  check(`[${mode}] signed in to the demo org`, await signIn(page));
  const reachedServer = [];
  let polls = 0;
  let sending = 0;
  const answered = [];
  await page.route("**/api/email/save", (r) => (answered.push(r.request().url()), r.fulfill({ json: { success: true, email: { id: "p3b-mock", status: "draft", subject: "x" } } })));
  await page.route("**/api/email/send", async (r) => {
    sending = 1;
    answered.push(r.request().url());
    const body = JSON.parse(r.request().postData() || "{}");
    check(`[${mode}] send carries the recipients (mocked)`, Array.isArray(body.recipientIds) && body.recipientIds.length > 0, `${body.recipientIds?.length}`);
    await r.fulfill({ json: { success: true, emailId: "p3b-mock", queued: true, inline: false, total: TOTAL, phase: "preparing", progress: SCRIPT[0], stats: { total: TOTAL, delivered: 0, failed: 0, suppressed: { bounced: 0, optedOut: 0 } } } });
  });
  await page.route("**/api/email/p3b-mock/progress", (r) => r.fulfill({ json: SCRIPT[Math.min(++polls, SCRIPT.length - 1)] }));
  await page.route("**/api/email/list?**", (r) => {
    const url = new URL(r.request().url());
    if (url.searchParams.get("status") !== "sending") return r.continue();
    return r.fulfill({ json: { success: true, emails: sending ? [{ id: "p3b-mock" }] : [], pagination: {} } });
  });
  page.on("request", (req) => {
    if (/\/api\/email\/(send|save)$/.test(new URL(req.url()).pathname)) reachedServer.push(req.url());
  });

  await page.goto(`${BASE}/${ORG}/admin/communications`, { waitUntil: "networkidle" });
  const badgeBefore = Number((await commsBadge(page)).replace("+", "")) || 0;
  const sendLabel = await composeAndSend(page, "Phase 3b queue check");
  check(`[${mode}] the composer offers the send`, /^Send to \d+ member/.test(sendLabel), sendLabel);
  const dialog = page.locator('[data-testid="send-progress-dialog"]');
  check(`[${mode}] the progress dialog opens (mocked)`, await dialog.waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false));
  await page.waitForTimeout(800);
  const badgeDuring = await commsBadge(page);
  check(
    `[${mode}] the Communications dock badge counts the send in flight (mocked)`,
    badgeDuring === "9+" || Number(badgeDuring) === badgeBefore + 1,
    `${badgeBefore} → ${badgeDuring || "none"}`
  );

  const seen = [];
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    const l = await labelOf(page);
    if (l && seen[seen.length - 1] !== l) seen.push(l);
    if (l.startsWith("Sent")) break;
    await page.waitForTimeout(250);
  }
  check(`[${mode}] Getting ready → Sending → Sent (mocked)`, JSON.stringify(seen) === JSON.stringify(EXPECTED), seen.join(" → "));
  const last = SCRIPT[SCRIPT.length - 1];
  check(`[${mode}] the final numbers are the aggregate's (mocked)`, seen.at(-1) === `Sent · ${last.sent} accepted, ${last.failed} failed, ${last.unknown} unknown`);
  check(`[${mode}] polled every 5 s until done, then stopped`, polls === 2, `${polls} polls`);
  check(`[${mode}] failures are listed`, (await page.locator('[data-testid="send-progress-errors"] li').count()) === 2);
  check(`[${mode}] "unknown" is explained`, ((await dialog.textContent()) || "").includes("never resent automatically"));
  check(`[${mode}] the dialog says Done`, ((await page.locator('[data-testid="send-progress-close"]').textContent()) || "").trim() === "Done");
  await page.screenshot({ path: `${OUT}/p3b-dialog-${mode}.png` });
  const fg = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="send-progress-label"]')).color);
  check(`[${mode}] the label is legible`, mode === "dark" ? !/rgb\(\s*(\d|[1-9]\d)\s*,/.test(fg) : true, fg);
  // Every save/send the page made was answered by the route (the request event
  // fires for routed requests too, so compare the two lists).
  check(`[${mode}] every save/send was answered locally, none reached the server`, reachedServer.length > 0 && reachedServer.join() === answered.join(), `${reachedServer.length} made, ${answered.length} answered`);
  check(`[${mode}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));

  // Close → the email's detail page: the final label and the per-row chips.
  await page.route("**/api/email/p3b-mock", (r) =>
    r.fulfill({
      json: {
        success: true,
        email: {
          id: "p3b-mock", status: "sent", subject: "Phase 3b queue check", content: "<p>x</p>", email_type: "notice",
          send_run_key: "m:x", organization: { id: "x", name: "Demo" }, attachments: [],
          recipients: [
            { id: "r1", recipient_name: "Alex", recipient_email: "a@example.com", status: "suppressed", suppressed_reason: "opted_out_mid_send" },
            { id: "r2", recipient_name: "Blair", recipient_email: "b@example.com", status: "unknown" },
            { id: "r3", recipient_name: "Casey", recipient_email: "c@example.com", status: "sent", delivery_status: "delivered" },
          ],
        },
      },
    })
  );
  await page.route("**/api/email/p3b-mock/activity**", (r) => r.fulfill({ json: { stats: null, clickedUrls: [], recentActivity: [] } }));
  await page.locator('[data-testid="send-progress-close"]').click();
  const onDetail = await page.waitForURL(/\/admin\/communications\/p3b-mock/, { timeout: 10000 }).then(() => true).catch(() => false);
  check(`[${mode}] Close opens the email's detail page`, onDetail, page.url());
  const card = page.locator('[data-testid="detail-send-progress"] [data-testid="send-progress-label"]');
  const detailLabel = await card.waitFor({ timeout: 10000 }).then(() => card.textContent()).then((t) => (t || "").trim()).catch(() => "");
  check(`[${mode}] the detail page shows the same final label (mocked)`, detailLabel === EXPECTED[2], detailLabel);
  const chips = await page.locator('[data-testid="recipient-chip"]').allTextContents();
  check(
    `[${mode}] the detail page's chips name held back, unknown and delivered (mocked)`,
    JSON.stringify(chips.map((c) => c.trim())) === JSON.stringify(["Held back · unsubscribed during send", "Unknown", "Delivered"]),
    chips.join(" | ")
  );
  await page.screenshot({ path: `${OUT}/p3b-detail-${mode}.png` });
  check(`[${mode}] no page errors on the detail page`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await context.close();
}

// ── The real send (--real) ──────────────────────────────────────────────────
async function runReal(browser) {
  const { context, page, errors } = await newPage(browser, { mode: "light" });
  check("[real] signed in to the demo org", await signIn(page));
  const secret = process.env.CRON_SECRET;
  check("[real] CRON_SECRET is set (to drive the tick)", !!secret);
  let emailId = null;
  page.on("response", async (res) => {
    if (new URL(res.url()).pathname === "/api/email/send" && res.ok()) emailId = (await res.json().catch(() => ({}))).emailId || null;
  });
  const sendLabel = await composeAndSend(page, `Phase 3b queue check ${new Date().toISOString()}`);
  const n = Number((sendLabel.match(/Send to (\d+)/) || [])[1] || 0);
  check("[real] the demo org has at least 60 members", n >= 60, sendLabel);
  const seen = [];
  const deadline = Date.now() + 120000;
  let lastKick = 0;
  while (Date.now() < deadline) {
    if (Date.now() - lastKick > 5000) {
      lastKick = Date.now();
      await page.request.get(`${BASE}/api/email/cron/continue-sends`, { headers: { "x-cron-secret": secret } }).catch(() => null);
    }
    const l = await labelOf(page);
    if (l && seen[seen.length - 1] !== l) seen.push(l);
    if (l.startsWith("Sent") || l.startsWith("Not sent")) break;
    await page.waitForTimeout(500);
  }
  check("[real] the dialog reached Sent", (seen.at(-1) || "").startsWith("Sent"), seen.join(" → "));
  check("[real] it showed Sending on the way", seen.some((l) => l.startsWith("Sending") || l.startsWith("Getting ready")), seen.join(" → "));
  if (emailId) {
    const rows = await d(`/items/hoa_email_recipients?filter[email][_eq]=${emailId}&fields=status&limit=-1`);
    const agg = { sent: 0, failed: 0, unknown: 0 };
    for (const r of rows) if (r.status in agg) agg[r.status]++;
    const want = `Sent · ${agg.sent} accepted${agg.failed ? `, ${agg.failed} failed` : ""}${agg.unknown ? `, ${agg.unknown} unknown` : ""}`;
    check("[real] the dialog's numbers are the aggregate of the rows", seen.at(-1) === want, `${seen.at(-1)} vs ${want}`);
    check("[real] no row left queued or claimed", rows.every((r) => !["queued", "claimed"].includes(r.status)));
  }
  await page.screenshot({ path: `${OUT}/p3b-dialog-real.png` });
  check("[real] no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
  await context.close();
  return emailId;
}

(async () => {
  const canSnapshot = !!(DIRECTUS && TOKEN);
  const before = canSnapshot ? await Promise.all([snapshot("demo"), snapshot("demo-classic")]) : null;
  if (!canSnapshot) console.log("(DIRECTUS_URL / DIRECTUS_STATIC_TOKEN unset: snapshots skipped)");
  const browser = await chromium.launch();
  let createdEmail = null;
  try {
    if (REAL) createdEmail = await runReal(browser);
    else for (const mode of ["light", "dark"]) await runMocked(browser, mode);
  } catch (e) {
    check("script ran to completion", false, e.message.split("\n").slice(0, 6).join(" | "));
  } finally {
    await browser.close();
  }
  if (before) {
    const after = await Promise.all([snapshot("demo"), snapshot("demo-classic")]);
    if (!REAL) {
      for (let i = 0; i < 2; i++) {
        check(`[snapshot] ${before[i].slug} identical before and after`, JSON.stringify(before[i]) === JSON.stringify(after[i]), JSON.stringify(after[i].hashes));
      }
    } else {
      const newEmails = after[0].emailIds.filter((id) => !before[0].emailIds.includes(id));
      check("[snapshot] demo gained exactly the one email it sent", newEmails.length === 1 && newEmails[0] === createdEmail, newEmails.join(","));
      check("[snapshot] demo's members unchanged by the send", before[0].hashes.members === after[0].hashes.members);
      if (createdEmail) await removeEmail(createdEmail).catch((e) => check("[cleanup] removed the test email", false, e.message));
      const clean = await Promise.all([snapshot("demo"), snapshot("demo-classic")]);
      for (let i = 0; i < 2; i++) {
        check(`[snapshot] ${before[i].slug} identical before and after (cleanup done)`, JSON.stringify(before[i]) === JSON.stringify(clean[i]), JSON.stringify(clean[i].counts));
      }
    }
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();

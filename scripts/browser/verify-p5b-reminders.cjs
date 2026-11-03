// Phase 5b browser verification (Round 3): Settings → Reminders, the resident
// "Up next" and the payments ledger's "Reminder sent".
//
//   pnpm build && PORT=3417 node --env-file=.env .output/server/index.mjs &
//   NODE_PATH=<dir holding playwright> node --env-file=.env scripts/browser/verify-p5b-reminders.cjs http://localhost:3417
//
// Signs in through POST /api/demo/login (the one-click demo account — no
// password is typed here) on the `demo` org, in light and in dark:
//
//   settings   Settings → Organization → Reminders: six rule cards, every one
//              off; turn dues on, set 5 days, turn the overdue stage off, Save
//              (PUT /api/org/reminders/settings for real) — Directus holds
//              enabled + approved_at + approved_by (the signed-in admin) +
//              stages + days; reload and the form shows it; the 24-hour dry
//              run answers (POST /api/org/reminders/dry-run, writes nothing);
//              the template preview is a sandboxed iframe on
//              /api/email/preview-mjml that follows the select; the Branding
//              card's select offers the four reminder templates; turn dues off
//              again and Save — the approval is cleared.
//   resident   `/demo?as=member` (an admin viewing as a resident): "Up next"
//              lists a meeting, a poll and a charge made for this run, and
//              /demo/payments shows "Reminder sent" on the charge.
//
// "Send me a test" is not pressed: it would put a bell row in the demo
// account's inbox (the route is covered by tests/server/reminder-admin-routes).
// What the run writes to `demo` it removes, and it puts the reminder settings
// back as it found them: a snapshot of `demo` (hashed) must be identical before
// and after. Screenshots go to $OUT_DIR (default: the OS temp dir).
const { chromium } = require("playwright");
const crypto = require("crypto");
const BASE = process.argv[2] || "http://localhost:3000";
const ORG = process.env.ORG_SLUG || "demo";
const OUT = process.env.OUT_DIR || require("os").tmpdir();
const DIRECTUS = process.env.DIRECTUS_URL;
const TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const DEMO_EMAIL = process.env.DEMO_USER_EMAIL;
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
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function orgRow() {
  const org = (await d(`/items/hoa_organizations?filter[slug][_eq]=${ORG}&fields=id,timezone,settings.id,settings.reminders&limit=1`))[0];
  if (!org) throw new Error(`no org ${ORG}`);
  return org;
}
async function snapshot() {
  const org = await orgRow();
  const q = (c) => d(`/items/${c}?filter[organization][_eq]=${org.id}&fields=*&sort=id&limit=-1`);
  const [meetings, polls, charges, members] = await Promise.all([q("hoa_meetings"), q("hoa_polls"), q("payment_requests"), q("hoa_members")]);
  return {
    timezone: org.timezone,
    reminders: org.settings?.reminders ?? null,
    counts: { meetings: meetings.length, polls: polls.length, charges: charges.length, members: members.length },
    hashes: { meetings: hash(meetings), polls: hash(polls), charges: hash(charges) },
  };
}

/** A meeting, an open poll and a charge for the demo admin, so Up next has something to say. */
async function createResidentData(org, memberId) {
  const made = [];
  const tryMake = async (collection, data) => {
    try {
      const row = await d(`/items/${collection}`, { method: "POST", body: JSON.stringify(data) });
      made.push({ collection, id: row.id });
      return row;
    } catch (e) {
      check(`[setup] created a ${collection} row`, false, e.message.split("\n")[0].slice(0, 200));
      return null;
    }
  };
  const when = new Date(Date.now() + 3 * 86_400_000);
  when.setUTCHours(23, 0, 0, 0);
  await tryMake("hoa_meetings", { organization: org, title: "Phase 5b check meeting", meeting_date: when.toISOString(), is_published: true, status: "scheduled", location: "Clubhouse" });
  await tryMake("hoa_polls", {
    organization: org,
    title: "Phase 5b check poll",
    options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }],
    status: "open",
    closes_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    target_audience: "all",
  });
  if (memberId) {
    await tryMake("payment_requests", {
      organization: org,
      member: memberId,
      title: "Phase 5b check dues",
      request_type: "monthly_dues",
      status: "active",
      amount: 125,
      amount_paid: 0,
      amount_remaining: 125,
      due_date: day(3),
      reminder_sent: true,
      reminder_sent_at: new Date().toISOString(),
    });
  }
  return made;
}

// ── Page helpers ────────────────────────────────────────────────────────────
async function newPage(browser, mode) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, colorScheme: mode, timezoneId: "America/New_York", locale: "en-US" });
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
const state = (loc) => loc.first().getAttribute("data-state").catch(() => null);

// ── Settings → Reminders ────────────────────────────────────────────────────
async function checkSettings(page, mode, org, userId) {
  await page.goto(`${BASE}/${ORG}/admin/settings/organization?tab=reminders`, { waitUntil: "networkidle" });
  await page.locator('[data-testid="reminders-settings"]').waitFor({ timeout: 30000 });
  // The Settings page re-renders once while it loads (the organization is read again); a click in
  // the first moments lands on the instance that is about to be replaced. Let it settle.
  await page.waitForTimeout(2000);
  check(`[${mode}] six rule cards`, (await page.locator('[data-testid^="reminder-rule-"]').count()) === 6);
  const tz = await page.locator("#reminderTimezone").inputValue();
  check(`[${mode}] the time zone select holds the community's zone`, tz === (org.timezone || "America/New_York"), tz);
  const toggle = page.locator('[data-testid="reminder-toggle-dues"]');
  check(`[${mode}] dues starts off`, (await state(toggle)) === "unchecked");

  await toggle.click();
  await page.locator("#reminderDays-dues").fill("5");
  await page.locator('[data-testid="reminder-rule-dues"] label', { hasText: "After the grace period" }).locator('button[role="checkbox"]').click();
  const save = page.locator('[data-testid="reminders-save"]');
  check(`[${mode}] Save wakes up on a change`, await save.isEnabled());
  await page.screenshot({ path: `${OUT}/p5b-settings-${mode}.png`, fullPage: true });

  const [res] = await Promise.all([page.waitForResponse((r) => r.url().includes("/api/org/reminders/settings") && r.request().method() === "PUT"), save.click()]);
  check(`[${mode}] PUT /api/org/reminders/settings answers 200`, res.status() === 200, String(res.status()));
  const saved = (await orgRow()).settings?.reminders?.rules?.dues || {};
  check(`[${mode}] Directus holds enabled + approval by the signed-in admin`, saved.enabled === true && saved.approved_by === userId && !!saved.approved_at, JSON.stringify(saved));
  check(`[${mode}] …the 5 days and the overdue stage off`, saved.days === 5 && saved.stages?.overdue === false, JSON.stringify({ days: saved.days, stages: saved.stages }));

  await page.reload({ waitUntil: "networkidle" });
  await page.locator('[data-testid="reminders-settings"]').waitFor({ timeout: 30000 });
  await page.waitForTimeout(2000);
  check(`[${mode}] after a reload the toggle is on`, (await state(page.locator('[data-testid="reminder-toggle-dues"]'))) === "checked");
  check(`[${mode}] …with 5 days`, (await page.locator("#reminderDays-dues").inputValue()) === "5");
  check(
    `[${mode}] …and the overdue stage off`,
    (await state(page.locator('[data-testid="reminder-rule-dues"] label', { hasText: "After the grace period" }).locator('button[role="checkbox"]'))) === "unchecked"
  );
  check(`[${mode}] …and says when it was approved`, /Approved /.test(await page.locator('[data-testid="reminder-rule-dues"]').innerText()));

  // The preview follows the select and stays sandboxed.
  const frame = page.locator('[data-testid="reminders-email-preview"]');
  check(`[${mode}] the preview is on the dues template`, ((await frame.getAttribute("src")) || "").includes("template=reminder-dues"));
  check(`[${mode}] …and sandboxed`, (await frame.getAttribute("sandbox")) === "");
  await page.locator("#reminderPreviewTemplate").selectOption("reminder-poll");
  await page.waitForFunction(() => document.querySelector('[data-testid="reminders-email-preview"]')?.getAttribute("src")?.includes("template=reminder-poll"), null, { timeout: 5000 });
  const previewRes = await page.request.get(`${BASE}${await frame.getAttribute("src")}`);
  check(`[${mode}] GET /api/email/preview-mjml renders the poll reminder`, previewRes.ok() && /poll|vote/i.test(await previewRes.text()));

  // The 24-hour dry run.
  await page.locator('[data-testid="reminders-dry-run-button"]').click();
  const headline = page.locator('[data-testid="reminders-dry-headline"]');
  await headline.waitFor({ timeout: 60000 });
  const said = ((await headline.textContent()) || "").trim();
  check(`[${mode}] the dry run answers`, said.length > 0, said);
  await page.locator('[data-testid="reminders-dry-run"]').screenshot({ path: `${OUT}/p5b-dryrun-${mode}.png` }).catch(() => {});

  // Turn it off again: the approval goes with it.
  await page.locator('[data-testid="reminder-toggle-dues"]').click();
  await Promise.all([page.waitForResponse((r) => r.url().includes("/api/org/reminders/settings") && r.request().method() === "PUT"), page.locator('[data-testid="reminders-save"]').click()]);
  const off = (await orgRow()).settings?.reminders?.rules?.dues || {};
  check(`[${mode}] turned off: enabled false, approval cleared`, off.enabled === false && !off.approved_at && !off.approved_by, JSON.stringify(off));

  // The Branding card offers the reminder templates too.
  await page.goto(`${BASE}/${ORG}/admin/settings/organization?tab=branding`, { waitUntil: "networkidle" });
  await page.locator("#emailPreviewType").waitFor({ timeout: 30000 });
  const options = await page.locator("#emailPreviewType option").evaluateAll((os) => os.map((o) => o.value));
  check(`[${mode}] the Branding select offers the four reminder templates`, ["reminder-dues", "reminder-meeting", "reminder-violation", "reminder-poll"].every((t) => options.includes(t)), options.join(","));
}

// ── The resident's surfaces ─────────────────────────────────────────────────
async function checkResident(page, mode) {
  await page.goto(`${BASE}/${ORG}?as=member`, { waitUntil: "networkidle" });
  const upNext = page.locator('[data-testid="up-next"]');
  await upNext.waitFor({ timeout: 30000 }).catch(() => {});
  check(`[${mode}] Up next shows on the resident home`, await upNext.isVisible());
  for (const kind of ["meeting", "poll", "dues"]) {
    check(`[${mode}] …with a ${kind} row`, (await page.locator(`[data-testid="up-next-${kind}"]`).count()) > 0);
  }
  const body = (await upNext.innerText().catch(() => "")) || "";
  check(`[${mode}] …saying what and when`, /Phase 5b check meeting/.test(body) && /Vote: Phase 5b check poll/.test(body) && /Due /.test(body), body.replace(/\s+/g, " ").slice(0, 160));
  await upNext.screenshot({ path: `${OUT}/p5b-upnext-${mode}.png` }).catch(() => {});

  await page.goto(`${BASE}/${ORG}/payments`, { waitUntil: "networkidle" });
  const sent = page.locator('[data-testid="payment-reminder-sent"]');
  await sent.first().waitFor({ timeout: 30000 }).catch(() => {});
  check(`[${mode}] the payments ledger says "Reminder sent"`, /Reminder sent /.test((await sent.first().textContent().catch(() => "")) || ""));
}

(async () => {
  if (!DIRECTUS || !TOKEN || !DEMO_EMAIL) {
    console.log("DIRECTUS_URL, DIRECTUS_STATIC_TOKEN and DEMO_USER_EMAIL are needed (node --env-file=.env …)");
    process.exit(2);
  }
  const before = await snapshot();
  const org = await orgRow();
  const user = (await d(`/users?filter[email][_eq]=${encodeURIComponent(DEMO_EMAIL)}&fields=id&limit=1`))[0];
  const member = user ? (await d(`/items/hoa_members?filter[organization][_eq]=${org.id}&filter[user][_eq]=${user.id}&fields=id&limit=1`))[0] : null;
  check("[setup] the demo admin has a member row in the demo org", !!member);
  const originalReminders = org.settings?.reminders ?? null;
  // Each mode starts from what the community had, so the two passes don't depend on each other.
  const restore = async () => {
    const row = await orgRow();
    if (row.settings?.id) await d(`/items/block_settings/${row.settings.id}`, { method: "PATCH", body: JSON.stringify({ reminders: originalReminders }) });
  };
  const browser = await chromium.launch();
  let made = [];
  try {
    made = await createResidentData(org.id, member?.id);
    for (const mode of ["light", "dark"]) {
      await restore();
      const { context, page, errors } = await newPage(browser, mode);
      check(`[${mode}] signed in to the demo org`, await signIn(page));
      await checkSettings(page, mode, org, user?.id).catch((e) => check(`[${mode}] settings check ran`, false, e.message.split("\n")[0]));
      await checkResident(page, mode).catch((e) => check(`[${mode}] resident check ran`, false, e.message.split("\n")[0]));
      check(`[${mode}] no page errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
      await context.close();
    }
  } catch (e) {
    check("script ran to completion", false, e.message.split("\n").slice(0, 4).join(" | "));
  } finally {
    await browser.close();
    for (const m of made.reverse()) await d(`/items/${m.collection}/${m.id}`, { method: "DELETE" }).catch((e) => check(`[cleanup] removed ${m.collection} ${m.id}`, false, e.message));
    await restore().catch((e) => check("[cleanup] restored the reminder settings", false, e.message));
  }
  const after = await snapshot();
  check("[snapshot] demo identical before and after (cleanup done)", JSON.stringify(before) === JSON.stringify(after), JSON.stringify(after.counts));
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();

// Phase 1a browser verification (Round 3). Run against a built server:
//   PORT=3123 <CI dummy env> node .output/server/index.mjs &
//   NODE_PATH=$(npm root -g) node scripts/browser/verify-p1a-shell.cjs http://localhost:3123
// Screenshots go to $OUT_DIR (default: the OS temp dir) — one per mode, plus one per failed focus check.
// Uses the pre-installed Playwright (cloud containers); not a package dependency.
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://localhost:3000";
const OUT = process.env.OUT_DIR || require("os").tmpdir();
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const OVERLAYS = [
  { key: "dialog", content: '[data-slot="dialog-content"]', scrim: '[data-slot="dialog-overlay"]' },
  { key: "sheet", content: '[data-slot="sheet-content"]', scrim: '[data-slot="sheet-overlay"]' },
  { key: "popover", content: '[data-slot="popover-content"]', chrome: true },
  { key: "dropdown", content: '[data-slot="dropdown-menu-content"]', chrome: true },
  { key: "tooltip", content: '[data-slot="tooltip-content"]', hover: true },
  { key: "select", content: '[data-slot="select-content"]' },
];

async function material(page, sel) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      cls: el.className,
      backdrop: cs.backdropFilter || cs.webkitBackdropFilter,
      bg: cs.backgroundColor,
      bgImage: cs.backgroundImage,
      position: cs.position,
      animationDuration: cs.animationDuration,
    };
  }, sel);
}

const alpha = (rgba) => {
  const m = /rgba?\(([^)]+)\)/.exec(rgba || "");
  if (!m) return 1;
  const p = m[1].split(/[ ,/]+/).filter(Boolean);
  return p.length > 3 ? Number(p[3]) : 1;
};

// The accent the focus ring should carry, resolved the way the CSS resolves it.
async function accentRgb(page, expr) {
  return page.evaluate((expr) => {
    const probe = document.createElement("span");
    probe.style.color = expr;
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
    return m ? `${m[1]}, ${m[2]}, ${m[3]}` : c;
  }, expr);
}

async function open(page, o) {
  const trigger = page.locator(`[data-kit-open="${o.key}"]`);
  if (o.hover) {
    await trigger.hover();
  } else {
    await trigger.click();
  }
  await page.waitForSelector(o.content, { state: "visible", timeout: 5000 });
  await page.waitForTimeout(350);
}

async function closeAll(page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.mouse.move(1, 1);
  await page.locator("h1").first().click({ position: { x: 2, y: 2 } }).catch(() => {});
  await page.waitForTimeout(200);
}

async function runMode(browser, mode) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: mode });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/ui-kit`, { waitUntil: "networkidle" });
  // Put the page in the requested mode via its own toggle (the workspace
  // appearance layer, not just the media query).
  const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  if ((mode === "dark") !== isDark) {
    await page.getByRole("button", { name: mode === "dark" ? "Dark" : "Light" }).first().click();
    await page.waitForTimeout(300);
  }
  const nowDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  check(`[${mode}] page is in ${mode} mode`, nowDark === (mode === "dark"));
  check(`[${mode}] html wears theme-app`, await page.evaluate(() => document.documentElement.classList.contains("theme-app")));

  for (const o of OVERLAYS) {
    await open(page, o);
    const m = await material(page, o.content);
    const glass = !!m && /glass-surface/.test(m.cls) && /glass-surface--strong/.test(m.cls) && /blur/.test(m.backdrop);
    check(`[${mode}] ${o.key} is strong glass`, glass, m ? `backdrop=${m.backdrop}` : "not found");
    if (o.chrome) check(`[${mode}] ${o.key} is floating chrome (opaque step)`, /chrome-float/.test(m?.cls || "") && alpha(m.bg) === 1, m?.bg);
    if (o.key === "dialog" || o.key === "sheet") {
      check(`[${mode}] ${o.key} is fixed (layered glass-surface position)`, m?.position === "fixed", m?.position);
      const s = await material(page, o.scrim);
      check(`[${mode}] ${o.key} scrim is dialog-overlay-glass`, !!s && /dialog-overlay-glass/.test(s.cls) && /blur/.test(s.backdrop), s?.backdrop);
    }
    if (o.key === "dialog") {
      // Keyboard focus inside the dialog: the ring must carry the accent (--ring).
      await page.keyboard.press("Tab");
      await page.keyboard.press("Tab");
      // Tailwind's ring-ring/50 compiles to color-mix(in oklab, var(--ring) 50%, transparent);
      // resolve the same expression so the computed strings compare exactly.
      const ringMix = await page.evaluate(() => {
        const s = document.createElement("span");
        s.style.color = "color-mix(in oklab, var(--ring) 50%, transparent)";
        document.body.appendChild(s);
        const c = getComputedStyle(s).color;
        s.remove();
        return c;
      });
      const ring = await accentRgb(page, "var(--ring)");
      const fieldRing = await accentRgb(page, "hsl(var(--app-accent-h) var(--glass-focus-s) var(--glass-focus-l))");
      const f = await page.evaluate(() => {
        const el = document.activeElement;
        const cs = getComputedStyle(el);
        return { tag: el.tagName, text: el.textContent?.trim().slice(0, 20), shadow: cs.boxShadow, outline: `${cs.outlineStyle} ${cs.outlineColor}` };
      });
      const hasAccent = f.shadow.includes(ringMix) || f.shadow.includes(ring) || f.shadow.includes(fieldRing) || f.outline.includes(ring);
      check(`[${mode}] dialog focus ring is the accent`, hasAccent, `${f.tag} "${f.text}" shadow=${f.shadow.slice(0, 120)} ring=${ringMix}`);
      if (!hasAccent) await page.screenshot({ path: `${OUT}/fail-${mode}-focus.png` });
    }
    await closeAll(page);
  }

  // useConfirm: Esc answers no, the action answers yes.
  await page.locator('[data-kit-open="confirm"]').click();
  await page.waitForSelector('[data-slot="alert-dialog-content"]', { state: "visible" });
  const cm = await material(page, '[data-slot="alert-dialog-content"]');
  check(`[${mode}] confirm dialog is strong glass`, /glass-surface--strong/.test(cm?.cls || "") && /blur/.test(cm?.backdrop || ""));
  const focusedCancel = await page.evaluate(() => document.activeElement?.textContent?.trim());
  check(`[${mode}] confirm focuses Cancel first`, focusedCancel === "Cancel", focusedCancel);
  await page.keyboard.press("Escape");
  await page.waitForSelector('[data-kit="confirm-result"]');
  check(`[${mode}] confirm: Esc resolves false`, (await page.textContent('[data-kit="confirm-result"]'))?.trim() === "Kept");
  await page.locator('[data-kit-open="confirm"]').click();
  await page.locator("[data-confirm-action]").click();
  await page.waitForTimeout(300);
  check(`[${mode}] confirm: action resolves true`, (await page.textContent('[data-kit="confirm-result"]'))?.trim() === "Deleted");

  // Date inputs are glass fields and show the raw-input v-model.
  const di = await material(page, '[data-kit="date-input"]');
  check(`[${mode}] DateInput is a glass field`, /glass-field/.test(di?.cls || ""));
  const dateText = await page.locator('[data-kit="date-input"]').innerText();
  check(`[${mode}] DateInput renders the bound date`, /11\/0?3\/2026/.test(dateText.replace(/\s/g, "")), dateText.replace(/\s+/g, " "));
  await page.locator('[data-kit="date-input"] button[aria-label="Open calendar"]').click();
  await page.waitForSelector('[data-slot="popover-content"] [data-slot="calendar"]', { state: "visible" });
  await page.locator('[data-slot="popover-content"] [data-reka-calendar-cell-trigger]:not([data-outside-view])', { hasText: /^14$/ }).first().click();
  await page.waitForTimeout(200);
  const vm = await page.locator('[data-kit="form-sections"] code').first().innerText();
  check(`[${mode}] calendar pick emits "YYYY-MM-DD"`, vm === "2026-11-14", vm);

  // Toggle group ON state wears the active thumb.
  const tg = await page.evaluate(() => {
    const on = document.querySelector('[data-slot="toggle-group-item"][data-state="on"]');
    return on ? getComputedStyle(on).boxShadow : null;
  });
  check(`[${mode}] toggle-group ON item has the thumb rim`, !!tg && tg !== "none", tg?.slice(0, 60));

  // Spotlight: ⌘K opens it, it finds a member, Enter navigates.
  await page.keyboard.press("Meta+k");
  let opened = await page.locator("[data-spotlight-input]").isVisible().catch(() => false);
  if (!opened) {
    await page.keyboard.press("Control+k");
    opened = await page.locator("[data-spotlight-input]").isVisible().catch(() => false);
  }
  await page.waitForTimeout(300);
  check(`[${mode}] ⌘K opens Spotlight`, opened);
  const sm = await material(page, '[data-slot="dialog-content"]');
  check(`[${mode}] Spotlight is strong glass`, /glass-surface--strong/.test(sm?.cls || ""));
  await page.locator("[data-spotlight-input]").fill("dana");
  await page.waitForSelector("[data-spotlight-hit]", { timeout: 4000 }).catch(() => {});
  const hit = await page.locator("[data-spotlight-hit]").first().innerText().catch(() => "");
  check(`[${mode}] Spotlight finds a member`, /Dana Whitfield/.test(hit), hit.replace(/\s+/g, " "));
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  check(`[${mode}] Enter navigates to the member`, /member=1/.test(page.url()), page.url());
  const stillOpen = await page.locator("[data-spotlight-input]").isVisible().catch(() => false);
  check(`[${mode}] Spotlight closes on navigate`, !stillOpen);

  check(`[${mode}] no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await page.screenshot({ path: `${OUT}/ui-kit-${mode}.png`, fullPage: false });
  await context.close();
}

async function runPrefs(browser) {
  // Reduced transparency → opaque overlays.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
  });
  await page.goto(`${BASE}/ui-kit`, { waitUntil: "networkidle" });
  const rt = await page.evaluate(() => matchMedia("(prefers-reduced-transparency: reduce)").matches);
  check("[rt] reduced-transparency emulated", rt);
  for (const o of OVERLAYS.filter((x) => !x.hover)) {
    await open(page, o);
    const m = await material(page, o.content);
    check(`[rt] ${o.key} drops the blur and is opaque`, m?.backdrop === "none" && alpha(m.bg) === 1, `backdrop=${m?.backdrop} bg=${m?.bg}`);
    if (o.scrim) {
      const s = await material(page, o.scrim);
      check(`[rt] ${o.key} scrim drops the blur`, s?.backdrop === "none", s?.backdrop);
    }
    await closeAll(page);
  }
  await context.close();

  // Reduced motion → springs are dead.
  const c2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const p2 = await c2.newPage();
  await p2.goto(`${BASE}/ui-kit`, { waitUntil: "networkidle" });
  const tokens = await p2.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return ["--spring", "--spring-out", "--spring-bounce", "--motion-panel"].map((v) => cs.getPropertyValue(v).trim());
  });
  check("[rm] motion tokens collapse (spring → linear, panel → 1ms)", tokens.slice(0, 3).every((t) => t === "linear") && tokens[3] === "1ms", tokens.join(" "));
  await p2.locator('[data-kit-open="dialog"]').click();
  await p2.waitForSelector('[data-slot="dialog-content"]');
  const d = await material(p2, '[data-slot="dialog-content"]');
  const secs = parseFloat(d?.animationDuration || "1");
  check("[rm] dialog enter animation is instant (≤1ms)", secs <= 0.0011, d?.animationDuration);
  await closeAll(p2);
  // Press feedback is off under reduced motion.
  const scale = await p2.evaluate(async () => {
    const b = document.querySelector('[data-kit-open="dialog"]');
    return getComputedStyle(b).scale;
  });
  check("[rm] no press-scale transform at rest", scale === "none" || scale === "1", scale);
  await c2.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    await runMode(browser, "light");
    await runMode(browser, "dark");
    await runPrefs(browser);
  } catch (e) {
    check("script ran to completion", false, e.message.split("\n")[0]);
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();

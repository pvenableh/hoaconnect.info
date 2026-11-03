/**
 * MJML partial composition (Earnest parity round 3, Phase 4).
 *
 * buildEmailHtml composes core/server/emails/_layout.mjml + _header.mjml +
 * _footer.mjml instead of one template string. The fixtures under
 * __fixtures__/email-html/ were written by the string builder before the
 * refactor: every type whose design didn't change must compile to the same
 * bytes. The one deliberate change is the logo lockup when the logo's
 * dimensions are known (50 px tall, at most 240 px wide), pinned separately.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { brandVars, buildEmailHtml, logoBox, resolveEmailTypeStyle, type EmailType } from "#core/server/utils/email-templates-mjml";
import { composeEmail, fillPartial, PARTIALS } from "#core/server/utils/email-partials";
import { contrastRatio, onColor } from "#core/shared/color-contrast";

const TYPES: EmailType[] = ["basic", "alert", "newsletter", "announcement", "reminder", "notice"];

const org = (settings: any = null, extra: any = {}) =>
  ({
    id: "org-1",
    name: "Harborview Lofts",
    legal_name: "Harborview Lofts Condominium Association, Inc.",
    slug: "demo",
    email: "board@harborview.example",
    street_address: "100 Harbor Way",
    city: "Portland",
    state: "ME",
    zip: "04101",
    settings,
    ...extra,
  }) as any;

const full = {
  subject: "Pool opening & summer hours",
  content: "<h2>Summer hours</h2><p>The pool opens <strong>June 1</strong>.</p><ul><li>Mon–Fri 9–9</li><li>Weekends 8–10</li></ul>",
  greeting: "Dear {first_name},",
  salutation: "Warm regards",
  boardMembers: [
    { name: "Ada Lovelace", title: "president" },
    { name: "Alan Turing", title: "treasurer" },
  ],
  recipientFirstName: "Grace",
  directusUrl: "https://cms.example",
  emailId: "email-1",
  appUrl: "https://app.example",
  headerText: "Official Communication of {name}",
  footerImage: "footer-file-id",
  homepageUrl: "https://harborview.example/",
  complianceFooter: { html: "COMPLIANCE-FOOTER-HTML", text: "COMPLIANCE-FOOTER-TEXT" },
};

const minimal = {
  subject: "Quick note",
  content: "Plain text body\n\nSecond paragraph.",
  directusUrl: "https://cms.example",
};

const branded = { colors: [{ primary: "#0f766e", accent: "#f59e0b" }], logo: "logo-file-id" };

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("partials: byte-stable against the string builder", () => {
  it.each(TYPES)("%s, every option on, platform palette", async (emailType) => {
    const html = buildEmailHtml({ ...full, emailType, organization: org() });
    await expect(html).toMatchFileSnapshot(`./__fixtures__/email-html/${emailType}-full.html`);
  });

  it.each(TYPES)("%s, nothing optional", async (emailType) => {
    const html = buildEmailHtml({ ...minimal, emailType, organization: org(null, { email: null, street_address: null, city: null, state: null, zip: null }) });
    await expect(html).toMatchFileSnapshot(`./__fixtures__/email-html/${emailType}-minimal.html`);
  });

  it.each(TYPES)("%s, org palette and a logo by id (no dimensions known)", async (emailType) => {
    const html = buildEmailHtml({ ...full, emailType, organization: org(branded) });
    await expect(html).toMatchFileSnapshot(`./__fixtures__/email-html/${emailType}-branded.html`);
  });

  it("the composer preview (body only)", async () => {
    const html = buildEmailHtml({ ...full, emailType: "newsletter", organization: org(branded), forPreview: true });
    await expect(html).toMatchFileSnapshot(`./__fixtures__/email-html/newsletter-preview.html`);
  });
});

describe("logo sizing from the file's metadata", () => {
  it.each([
    ["a wide wordmark", { width: 1000, height: 200 }, { width: 240, height: 48 }],
    ["a square icon", { width: 600, height: 600 }, { width: 50, height: 50 }],
    ["a tall crest", { width: 300, height: 600 }, { width: 25, height: 50 }],
    ["a small logo is never enlarged", { width: 40, height: 20 }, { width: 40, height: 20 }],
  ])("%s", (_name, meta, box) => {
    expect(logoBox(meta)).toEqual(box);
  });

  it("no dimensions → null (the pre-Phase-4 lockup)", () => {
    expect(logoBox("file-id")).toBeNull();
    expect(logoBox({ id: "x", width: null, height: 10 })).toBeNull();
  });

  it("known dimensions: explicit width/height on the plate, the bitmap at 2×", () => {
    const html = buildEmailHtml({
      ...full,
      emailType: "notice",
      organization: org({ ...branded, logo: { id: "logo-file-id", width: 1000, height: 200 } }),
    });
    expect(html).toContain(`src="https://cms.example/assets/logo-file-id?width=480&height=96&format=png&fit=inside&quality=80"`);
    expect(html).toContain(`width="240" height="48"`);
    expect(html).toContain("width:240px;height:48px;");
    expect(html).toContain("background-color:#ffffff;border-radius:8px");
  });
});

describe("brandVars: the label colour on the brand colour", () => {
  it("brandOnColor is the higher-contrast of white and ink", () => {
    expect(brandVars(org({ colors: [{ primary: "#0f766e", accent: "#fde68a" }] }), "notice", "https://d").brandOnColor).toBe("#1f2937");
    expect(brandVars(org({ colors: [{ primary: "#0f766e", accent: "#1e3a8a" }] }), "notice", "https://d").brandOnColor).toBe("#ffffff");
    expect(onColor("#fde68a")).toBe("#1f2937");
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });

  it("alert's red pill keeps its white label on any palette (semantic, not brand)", () => {
    expect(resolveEmailTypeStyle("alert", { colors: [{ primary: "#0f766e", accent: "#fde68a" }] } as any).badgeTextColor).toBe("#ffffff");
  });

  it("a platform-palette org gets the platform literals", () => {
    const v = brandVars(org(), "newsletter", "https://d");
    expect(v).toMatchObject({ headerBandBg: "#1e3a5f", accentColor: "#0ea5e9", brandOnColor: "#ffffff", logoUrl: "", logoImg: "" });
  });
});

describe("fillPartial / composeEmail", () => {
  it("one pass: a value's own {{tokens}} reach the merge step untouched", () => {
    expect(fillPartial("<p>{{body}}</p>", { body: "Hi {{first_name}} {{#if x}}" })).toBe("<p>Hi {{first_name}} {{#if x}}</p>");
  });

  it("nested ifs, else, and notes stripped", () => {
    const src = "{{!-- a note --}}\n{{#if a}}A{{#if b}}B{{else}}b{{/if}}{{else}}{{#if b}}nb{{/if}}{{/if}}";
    expect(fillPartial(src, { a: true, b: false })).toBe("Ab");
    expect(fillPartial(src, { a: false, b: true })).toBe("nb");
  });

  it("a name the caller didn't pass throws", () => {
    expect(() => fillPartial("{{missing}}", {}, "_x")).toThrow("_x: no value for {{missing}}");
    expect(() => fillPartial("{{#if missing}}x{{/if}}", {}, "_x")).toThrow("no value for {{#if missing}}");
  });

  it("the slots take the filled partials; slot text is not scanned again", () => {
    const out = composeEmail(
      { subject: "S", preheader: "P", webFonts: "", bodyFont: "Arial", bodyBg: "#fff", webViewHref: "", wrapperPadding: "8px" },
      { header: "<!-- H -->", content: "<!-- @FOOTER -->", footer: "<!-- F -->" }
    );
    expect(out).toContain("<!-- H -->");
    expect(out.match(/<!-- @FOOTER -->/g)).toHaveLength(1);
    expect(out.indexOf("<!-- H -->")).toBeLessThan(out.indexOf("<!-- F -->"));
    expect(PARTIALS.layout).toContain("<!-- @CONTENT -->");
  });
});

/**
 * Per-org email branding — the two resolution chains that are easy to break.
 *
 * resolveEmailBranding: per-send override → per-org default → fallback, for the
 * header line / footer photo / homepage link.
 *
 * resolveEmailTypeStyle: org palette (`block_settings.colors[0]`) → platform
 * default. The contract that matters most is the regression one: an org with
 * NO palette must get the platform style byte-for-byte, because that is what
 * every existing send looks like.
 */
import { describe, it, expect } from "vitest";
import {
  resolveEmailBranding,
  applyHeaderTextTokens,
} from "#core/server/utils/email-branding";
import {
  resolveEmailTypeStyle,
  buildEmailHtml,
  type EmailType,
} from "#core/server/utils/email-templates-mjml";

const org = (settings: any = null, extra: any = {}) =>
  ({
    id: "org-1",
    name: "Harborview Lofts",
    legal_name: "Harborview Lofts Condominium Association, Inc.",
    slug: "demo",
    external_url: null,
    settings,
    ...extra,
  }) as any;

describe("resolveEmailBranding precedence", () => {
  const settings = {
    id: "s-1",
    header_text: "Org default line",
    footer_image: "org-footer-file",
    homepage_url: "https://org-homepage.test",
  };

  it("uses per-org defaults when the email has no overrides", () => {
    const b = resolveEmailBranding(org(settings), null, { appUrl: "https://app.example" });
    expect(b.headerText).toBe("Org default line");
    expect(b.footerImage).toBe("org-footer-file");
    expect(b.homepageUrl).toBe("https://org-homepage.test");
  });

  it("per-send fields on the email record beat the org defaults", () => {
    const b = resolveEmailBranding(org(settings), {
      header_text: "This send only",
      footer_image: "send-footer-file",
    });
    expect(b.headerText).toBe("This send only");
    expect(b.footerImage).toBe("send-footer-file");
  });

  it("explicit overrides beat both the email record and the org", () => {
    const b = resolveEmailBranding(
      org(settings),
      { header_text: "email-record", footer_image: "email-record-file" },
      { overrides: { headerText: "override", footerImage: "override-file" } }
    );
    expect(b.headerText).toBe("override");
    expect(b.footerImage).toBe("override-file");
  });

  it("falls back to null header/footer for an org with nothing set", () => {
    const b = resolveEmailBranding(org(), null, {});
    expect(b.headerText).toBeNull();
    expect(b.footerImage).toBeNull();
  });

  it("homepage falls back external_url → portal url", () => {
    const external = resolveEmailBranding(org(null, { external_url: "https://ext.test" }), null, {
      appUrl: "https://app.example",
    });
    expect(external.homepageUrl).toBe("https://ext.test");

    const portal = resolveEmailBranding(org(), null, { appUrl: "https://app.example" });
    expect(portal.homepageUrl).toBe("https://app.example/demo");
  });

  it("applyHeaderTextTokens substitutes {name} and {legal_name}", () => {
    expect(applyHeaderTextTokens("Official Communication of {name}", "Harborview")).toBe(
      "Official Communication of Harborview"
    );
    expect(applyHeaderTextTokens("{legal_name}", "Harborview", "Harborview, Inc.")).toBe(
      "Harborview, Inc."
    );
  });
});

// The platform defaults as shipped — the byte-identity contract for orgs
// without a palette. If these change, every existing send changes.
const PLATFORM_STYLES: Record<EmailType, { headerBg: string; accentColor: string }> = {
  basic: { headerBg: "#ffffff", accentColor: "#3b82f6" },
  alert: { headerBg: "#7f1d1d", accentColor: "#ef4444" },
  newsletter: { headerBg: "#1e3a5f", accentColor: "#0ea5e9" },
  announcement: { headerBg: "#7c2d12", accentColor: "#f97316" },
  reminder: { headerBg: "#713f12", accentColor: "#eab308" },
  notice: { headerBg: "#14532d", accentColor: "#22c55e" },
};

const DARK_OVERLAYS = {
  headerTextColor: "#ffffff",
  headerSubTextColor: "#e5e7eb",
  footerTextColor: "#9ca3af",
  badgeTextColor: "#ffffff",
};

describe("resolveEmailTypeStyle", () => {
  it("org without a palette gets the platform style, overlays included", () => {
    for (const emailType of Object.keys(PLATFORM_STYLES) as EmailType[]) {
      for (const settings of [null, undefined, {}, { colors: null }, { colors: [] }]) {
        const style = resolveEmailTypeStyle(emailType, settings as any);
        expect(style).toMatchObject({ ...PLATFORM_STYLES[emailType], ...DARK_OVERLAYS });
      }
    }
  });

  it("org palette drives header and badge for a non-alert type", () => {
    const style = resolveEmailTypeStyle("notice", {
      colors: [{ primary: "#0f172a", secondary: "#64748b", accent: "#7c3aed" }],
    } as any);
    expect(style.headerBg).toBe("#0f172a");
    expect(style.accentColor).toBe("#7c3aed");
    // Semantics stay in the badge content, not the colour.
    expect(style.icon).toBe("📋");
    expect(style.label).toBe("Notice");
    expect(style).toMatchObject(DARK_OVERLAYS);
  });

  it("alert keeps its red badge whatever the brand palette", () => {
    const style = resolveEmailTypeStyle("alert", {
      colors: [{ primary: "#0f172a", secondary: "#64748b", accent: "#a7f3d0" }],
    } as any);
    expect(style.headerBg).toBe("#0f172a");
    expect(style.accentColor).toBe("#ef4444");
    expect(style.icon).toBe("🚨");
  });

  it("a light primary flips the overlay text dark (605 Lincoln's gray)", () => {
    const style = resolveEmailTypeStyle("notice", {
      colors: [{ primary: "#8f8f8f", secondary: "#d1d1d1", accent: "#00E1FF" }],
    } as any);
    expect(style.headerBg).toBe("#8f8f8f");
    expect(style.headerTextColor).toBe("#1f2937");
    expect(style.headerSubTextColor).toBe("#4b5563");
    expect(style.footerTextColor).toBe("#4b5563");
    // Cyan accent is light too — dark badge text.
    expect(style.accentColor).toBe("#00E1FF");
    expect(style.badgeTextColor).toBe("#1f2937");
  });

  it("accent-only palette applies the accent and keeps the type header", () => {
    const style = resolveEmailTypeStyle("newsletter", {
      colors: [{ primary: "", secondary: "", accent: "#7c3aed" }],
    } as any);
    expect(style.headerBg).toBe("#1e3a5f");
    expect(style.accentColor).toBe("#7c3aed");
  });

  it("non-hex palette values are rejected (they land unescaped in inline styles)", () => {
    for (const bad of ["red", "rgb(0,0,0)", '#fff"><script>', "#ffff", null, 42]) {
      const style = resolveEmailTypeStyle("notice", {
        colors: [{ primary: bad, secondary: bad, accent: bad }],
      } as any);
      expect(style).toMatchObject({ ...PLATFORM_STYLES.notice, ...DARK_OVERLAYS });
    }
  });

  it("basic ignores the palette — it is brand-neutral by design", () => {
    const style = resolveEmailTypeStyle("basic", {
      colors: [{ primary: "#0f172a", secondary: "#64748b", accent: "#7c3aed" }],
    } as any);
    expect(style).toMatchObject({ ...PLATFORM_STYLES.basic, ...DARK_OVERLAYS });
  });
});

describe("buildEmailHtml uses the org palette", () => {
  const common = {
    subject: "Test",
    content: "<p>Body</p>",
    directusUrl: "https://directus.example",
  };

  it("renders the org primary in the chrome when a palette is set", () => {
    const html = buildEmailHtml({
      ...common,
      organization: org({ colors: [{ primary: "#0f172a", secondary: "#64748b", accent: "#7c3aed" }] }),
      emailType: "notice",
    });
    expect(html).toContain("#0f172a");
    expect(html).toContain("#7c3aed");
    expect(html).not.toContain("#14532d");
  });

  it("renders the platform palette when the org has none", () => {
    const html = buildEmailHtml({
      ...common,
      organization: org(),
      emailType: "notice",
    });
    expect(html).toContain("#14532d");
    expect(html).toContain("#22c55e");
  });
});

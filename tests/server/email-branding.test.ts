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
  resolveEmailFonts,
  buildEmailHtml,
  buildWebViewHtml,
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

// The stack every email used before typography became per-org.
const DEFAULT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

describe("resolveEmailFonts", () => {
  it("an org with no theme keeps the historical stack and requests no web font", () => {
    for (const settings of [null, undefined, {}, { theme: null }, { theme: "nonsense" }]) {
      const f = resolveEmailFonts(settings as any);
      expect(f.heading).toBe(DEFAULT_STACK);
      expect(f.body).toBe(DEFAULT_STACK);
      expect(f.webFonts).toEqual([]);
    }
  });

  it("classic pairs Playfair Display with Mulish", () => {
    const f = resolveEmailFonts({ theme: "classic" } as any);
    expect(f.heading).toContain("Playfair Display");
    expect(f.body).toContain("Mulish");
    expect(f.webFonts.map((w) => w.name)).toEqual(["Playfair Display", "Mulish"]);
  });

  it("modern uses Inter for both roles", () => {
    const f = resolveEmailFonts({ theme: "modern" } as any);
    expect(f.heading).toContain("Inter");
    expect(f.body).toContain("Inter");
    expect(f.webFonts.map((w) => w.name)).toEqual(["Inter"]);
  });

  it("luxury pairs Bodoni Moda with Jost", () => {
    const f = resolveEmailFonts({ theme: "luxury" } as any);
    expect(f.heading).toContain("Bodoni Moda");
    expect(f.body).toContain("Jost");
    expect(f.webFonts.map((w) => w.name)).toEqual(["Bodoni Moda", "Jost"]);
  });

  it("every stack ends in a face that exists on every machine", () => {
    // Gmail and Outlook strip the web font, so the tail IS what most people see.
    for (const theme of ["classic", "modern", "luxury", null]) {
      const f = resolveEmailFonts({ theme } as any);
      for (const stack of [f.heading, f.body]) {
        expect(stack).toMatch(/(Arial, sans-serif|Times, serif)$/);
      }
    }
  });

  it("web fonts are requested from Google over https", () => {
    for (const theme of ["classic", "modern", "luxury"]) {
      for (const w of resolveEmailFonts({ theme } as any).webFonts) {
        expect(w.href).toMatch(/^https:\/\/fonts\.googleapis\.com\/css2\?family=/);
        expect(w.href).toContain("display=swap");
      }
    }
  });
});

describe("buildEmailHtml applies the theme's typography", () => {
  const common = {
    subject: "Test",
    content: "<h2>A heading</h2><p>Body</p>",
    directusUrl: "https://directus.example",
    emailType: "notice" as EmailType,
  };

  it("classic requests both fonts and sets the heading face on content headings", () => {
    const html = buildEmailHtml({
      ...common,
      organization: org({ theme: "classic" }),
    });
    expect(html).toContain("fonts.googleapis.com");
    expect(html).toContain("Playfair+Display");
    expect(html).toContain("Mulish");
    // the <h2> in the body carries the heading stack, not the body stack
    expect(html).toMatch(/<h2[^>]*font-family: 'Playfair Display'/);
  });

  it("modern requests Inter only", () => {
    const html = buildEmailHtml({ ...common, organization: org({ theme: "modern" }) });
    expect(html).toContain("Inter");
    expect(html).not.toContain("Playfair");
    expect(html).not.toContain("Bodoni");
  });

  it("an unthemed org requests no THEME font", () => {
    const html = buildEmailHtml({ ...common, organization: org() });
    for (const family of ["Playfair", "Mulish", "Inter", "Bodoni", "Jost"]) {
      expect(html).not.toContain(family);
    }
    // NOT `not.toContain("fonts.googleapis.com")`: MJML injects its own
    // Roboto link into every email it compiles, and always has. That request
    // predates this feature — see the note in the plan.
    expect(html).toContain("family=Roboto");
  });

  it("typography and palette are independent — an org can have one without the other", () => {
    const fontsOnly = buildEmailHtml({ ...common, organization: org({ theme: "classic" }) });
    expect(fontsOnly).toContain("Playfair+Display");
    expect(fontsOnly).toContain("#14532d"); // still the platform palette

    const paletteOnly = buildEmailHtml({
      ...common,
      organization: org({ colors: [{ primary: "#0f172a", secondary: "#64748b", accent: "#7c3aed" }] }),
    });
    expect(paletteOnly).toContain("#0f172a");
    expect(paletteOnly).not.toContain("Playfair");
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

describe("buildWebViewHtml follows the theme", () => {
  const common = {
    subject: "A subject",
    content: "<h2>Heading</h2><p>Body</p>",
    directusUrl: "https://directus.example",
    emailType: "notice" as EmailType,
  };

  it("an unthemed org keeps the page's own Avenir stack and grey rules", () => {
    const html = buildWebViewHtml({ ...common, organization: org() });
    expect(html).toContain("Avenir, -apple-system");
    expect(html).toContain("border-top:solid 1px lightgrey;");
    expect(html).not.toContain("fonts.googleapis.com");
  });

  it("a themed org links the web font and uses it — this page is a browser, so it always loads", () => {
    const html = buildWebViewHtml({ ...common, organization: org({ theme: "classic" }) });
    expect(html).toContain('<link rel="stylesheet" href="https://fonts.googleapis.com');
    expect(html).toContain("Playfair+Display");
    expect(html).toContain("Mulish");
    expect(html).toMatch(/<h3 style="font-family:'Playfair Display'/);
    expect(html).not.toContain("Avenir");
  });

  it("the org's primary tints the subject and the rule, not the whole page", () => {
    const html = buildWebViewHtml({
      ...common,
      organization: org({ theme: "classic", colors: [{ primary: "#454545", secondary: "#8b7355", accent: "#c9a96e" }] }),
    });
    expect(html).toContain("color: #454545;");
    expect(html).toContain("border-top:solid 1px #45454533;");
    // the editorial grey survives everywhere else
    expect(html).toContain("#666666");
  });

  it("urgent still overrides the brand colour outright", () => {
    const html = buildWebViewHtml({
      ...common,
      urgent: true,
      organization: org({ theme: "classic", colors: [{ primary: "#454545", secondary: "#8b7355", accent: "#c9a96e" }] }),
    });
    expect(html).toContain("color: red;");
    expect(html).toContain("🚨");
  });

  it("renders the logo slot when set, and the org name only when it is not", () => {
    const withLogo = buildWebViewHtml({ ...common, organization: org({ theme: "classic", logo: "file-abc" }) });
    expect(withLogo).toContain("/assets/file-abc");
    expect(withLogo).not.toMatch(/letter-spacing: 0\.15em/);

    const without = buildWebViewHtml({ ...common, organization: org({ theme: "classic" }) });
    expect(without).not.toContain("/assets/");
    expect(without).toMatch(/letter-spacing: 0\.15em/);
    // the name stands in for the logo, so it takes the heading face
    expect(without).toContain("font-family:'Playfair Display'");
  });
});

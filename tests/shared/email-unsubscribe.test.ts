/**
 * The assembler (Phase 3a): what a member email carries, read from the
 * builders' output — never by sending.
 *
 *   · community mail with a token → exactly the RFC 8058 pair of headers, and a
 *     footer with Unsubscribe · Preferences · the org's postal address;
 *   · essential mail → no List-Unsubscribe, and the can't-be-unsubscribed line;
 *   · community mail from an org with no postal address → refused, 400, with a
 *     code and a sentence that names what is missing;
 *   · the footer lands in the MJML, text, raw and web-view bodies.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  buildComplianceFooter,
  buildOneClickUnsubscribeUrl,
  buildPreferencesUrl,
  buildUnsubscribeUrl,
  checkSendCompliance,
  isUnsubscribeToken,
  listUnsubscribeHeaders,
  maskEmail,
  orgMailingAddress,
  recipientCompliance,
  SENDER_ADDRESS_MISSING,
} from "#core/shared/email/unsubscribe";
import { NEWSLETTER_NOT_ESSENTIAL } from "#core/shared/email/email-class";

const APP = "https://app.hoaconnect.info";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012-_9"; // 32 base64url chars
const ORG = {
  name: "Maple & Main HOA",
  slug: "maple",
  street_address: "605 Lincoln Rd",
  city: "Miami Beach",
  state: "FL",
  zip: "33139",
};

describe("tokens and URLs", () => {
  it("accepts only 32-character base64url tokens", () => {
    expect(isUnsubscribeToken(TOKEN)).toBe(true);
    expect(isUnsubscribeToken(TOKEN.slice(1))).toBe(false);
    expect(isUnsubscribeToken(`${TOKEN.slice(1)}=`)).toBe(false);
    expect(isUnsubscribeToken(`${TOKEN.slice(1)}/`)).toBe(false);
    expect(isUnsubscribeToken(null)).toBe(false);
    expect(isUnsubscribeToken(123)).toBe(false);
  });

  it("builds the page link, the one-click URL and the preferences link", () => {
    expect(buildUnsubscribeUrl(`${APP}/`, TOKEN, "e-1")).toBe(`${APP}/unsubscribe?token=${TOKEN}&e=e-1`);
    expect(buildUnsubscribeUrl(APP, null)).toBe(`${APP}/unsubscribe`);
    expect(buildOneClickUnsubscribeUrl(APP, TOKEN)).toBe(`${APP}/api/email/unsubscribe/one-click?token=${TOKEN}`);
    expect(buildPreferencesUrl(APP, "maple")).toBe(`${APP}/maple/profile#email`);
    expect(buildPreferencesUrl(APP, null)).toBe(`${APP}/account`);
  });

  it("emits exactly the two RFC 8058 headers, https only", () => {
    const url = buildOneClickUnsubscribeUrl(APP, TOKEN, "e-1");
    expect(listUnsubscribeHeaders(url)).toEqual({
      "List-Unsubscribe": `<${APP}/api/email/unsubscribe/one-click?token=${TOKEN}&e=e-1>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(listUnsubscribeHeaders(url)["List-Unsubscribe"]).not.toMatch(/mailto:/);
  });

  it("masks an address enough to recognise it", () => {
    expect(maskEmail("peter@example.com")).toBe("p•••r@example.com");
    expect(maskEmail("al@x.io")).toBe("a•••@x.io");
    expect(maskEmail("nope")).toBeNull();
    expect(maskEmail(null)).toBeNull();
  });
});

describe("the org's postal address", () => {
  it("needs a street and a city or ZIP", () => {
    expect(orgMailingAddress(ORG)).toBe("605 Lincoln Rd, Miami Beach, FL 33139");
    expect(orgMailingAddress({ street_address: "1 Elm St", zip: "02139" })).toBe("1 Elm St, 02139");
    expect(orgMailingAddress({ city: "Springfield", state: "IL" })).toBeNull();
    expect(orgMailingAddress({ street_address: "  ", city: "Springfield" })).toBeNull();
    expect(orgMailingAddress({ street_address: "1 Elm St" })).toBeNull();
    expect(orgMailingAddress(null)).toBeNull();
  });
});

describe("checkSendCompliance — the per-send gate", () => {
  it("refuses community mail from an org with no address: 400, SENDER_ADDRESS_MISSING, names the fix", () => {
    const r = checkSendCompliance({ emailType: "announcement", org: { name: "Oak Court", city: "Austin" } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.statusCode).toBe(400);
      expect(r.code).toBe(SENDER_ADDRESS_MISSING);
      expect(r.message).toMatch(/Oak Court has no mailing address/);
      expect(r.message).toMatch(/Settings → Organization/);
    }
  });

  it("lets essential mail go without an address", () => {
    expect(checkSendCompliance({ emailType: "notice", org: { name: "Oak Court" } })).toEqual({
      ok: true,
      emailClass: "essential",
      mailingAddress: null,
    });
  });

  it("refuses a newsletter marked essential before it looks at the address", () => {
    const r = checkSendCompliance({ emailType: "newsletter", requestedClass: "essential", org: ORG });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(NEWSLETTER_NOT_ESSENTIAL);
  });

  it("passes community mail with an address and returns it", () => {
    expect(checkSendCompliance({ emailType: "newsletter", org: ORG })).toEqual({
      ok: true,
      emailClass: "community",
      mailingAddress: "605 Lincoln Rd, Miami Beach, FL 33139",
    });
  });
});

describe("recipientCompliance — the per-recipient assembly", () => {
  const address = orgMailingAddress(ORG);

  it("community + token: one-click headers and a footer with Unsubscribe · Preferences · address", () => {
    const rc = recipientCompliance({ emailClass: "community", org: ORG, mailingAddress: address, appUrl: APP, emailId: "e-1", token: TOKEN });
    expect(rc.headers).toEqual({
      "List-Unsubscribe": `<${APP}/api/email/unsubscribe/one-click?token=${TOKEN}&e=e-1>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(rc.unsubscribeUrl).toBe(`${APP}/unsubscribe?token=${TOKEN}&e=e-1`);
    expect(rc.footer.html).toContain(`href="${APP}/unsubscribe?token=${TOKEN}&amp;e=e-1"`);
    expect(rc.footer.html).toContain(">Unsubscribe</a>");
    expect(rc.footer.html).toContain(`href="${APP}/maple/profile#email"`);
    expect(rc.footer.html).toContain("605 Lincoln Rd, Miami Beach, FL 33139");
    expect(rc.footer.html).toContain("Maple &amp; Main HOA"); // escaped
    expect(rc.footer.text).toBe(
      [
        "You're receiving this because you're a member of Maple & Main HOA.",
        `Unsubscribe: ${APP}/unsubscribe?token=${TOKEN}&e=e-1`,
        `Preferences: ${APP}/maple/profile#email`,
        "605 Lincoln Rd, Miami Beach, FL 33139",
      ].join("\n")
    );
  });

  it("community without a token (CC copy, test send, unprovisioned): no headers, the generic page", () => {
    const rc = recipientCompliance({ emailClass: "community", org: ORG, mailingAddress: address, appUrl: APP, token: null });
    expect(rc.headers).toEqual({});
    expect(rc.unsubscribeUrl).toBe(`${APP}/unsubscribe`);
    expect(rc.footer.text).toContain(`Unsubscribe: ${APP}/unsubscribe\n`);
    // A malformed stored token is treated as none.
    expect(recipientCompliance({ emailClass: "community", org: ORG, mailingAddress: address, appUrl: APP, token: "short" }).headers).toEqual({});
  });

  it("essential: never List-Unsubscribe, and the footer says why", () => {
    const rc = recipientCompliance({ emailClass: "essential", org: ORG, mailingAddress: address, appUrl: APP, token: TOKEN });
    expect(rc.headers).toEqual({});
    expect(rc.unsubscribeUrl).toBeNull();
    expect(rc.footer.text).toContain("You receive this because you are a member of Maple & Main HOA; it cannot be unsubscribed.");
    expect(rc.footer.text).not.toMatch(/Unsubscribe:/);
    expect(rc.footer.text).toContain(`Preferences: ${APP}/maple/profile#email`);
  });

  it("notification wording for per-user notifications", () => {
    const f = buildComplianceFooter({ emailClass: "essential", orgName: "Oak", reason: "notifications", preferencesUrl: `${APP}/oak/profile#email` });
    expect(f.text.split("\n")[0]).toBe("You receive this because you are a member of Oak and these notifications are on.");
  });

  it("inviter wording for the accepted note, with no Preferences link (the inviter may not be a member)", () => {
    const f = buildComplianceFooter({ emailClass: "essential", orgName: "Oak", reason: "inviter", preferencesUrl: `${APP}/oak/profile#email` });
    expect(f.text.split("\n")[0]).toBe("You receive this because you invited someone to join Oak on HOA Connect and they accepted.");
    expect(f.text).not.toContain("Preferences");
    expect(f.html).not.toContain("profile#email");
  });
});

describe("the footer in every body the builders produce", () => {
  const footer = recipientCompliance({
    emailClass: "community",
    org: ORG,
    mailingAddress: orgMailingAddress(ORG),
    appUrl: APP,
    emailId: "e-1",
    token: TOKEN,
  }).footer;
  const organization = { id: "o1", ...ORG, settings: null } as any;

  // The MJML module is a heavy cold import; pay it once, off any test's clock.
  beforeAll(async () => {
    await import("#core/server/utils/email-templates-mjml");
  }, 120_000);

  it("MJML (visual) HTML", async () => {
    const { buildEmailHtml } = await import("#core/server/utils/email-templates-mjml");
    const html = buildEmailHtml({ organization, subject: "S", content: "<p>Hi</p>", emailType: "newsletter", directusUrl: "https://d", complianceFooter: footer });
    expect(html).toContain("email-compliance-footer");
    expect(html).toContain(`${APP}/unsubscribe?token=${TOKEN}&amp;e=e-1`);
    expect(html).toContain("605 Lincoln Rd, Miami Beach, FL 33139");
  });

  it("plain text", async () => {
    const { buildEmailText } = await import("#core/server/utils/email-templates-mjml");
    const text = buildEmailText({ organization, subject: "S", content: "Hi", emailType: "newsletter", directusUrl: "https://d", complianceFooter: footer });
    expect(text.endsWith(footer.text)).toBe(true);
  });

  it("raw mode: just before </body>, or appended", async () => {
    const { appendComplianceFooterHtml } = await import("#core/server/utils/email-templates-mjml");
    const doc = appendComplianceFooterHtml("<html><body><p>Mine</p></body></html>", footer);
    expect(doc.indexOf("email-compliance-footer")).toBeGreaterThan(doc.indexOf("Mine"));
    expect(doc.indexOf("email-compliance-footer")).toBeLessThan(doc.indexOf("</body>"));
    expect(appendComplianceFooterHtml("<p>Mine</p>", footer)).toMatch(/^<p>Mine<\/p><div[^>]*>.*email-compliance-footer/);
    expect(appendComplianceFooterHtml("<p>x</p>", null)).toBe("<p>x</p>");
  });

  it("web view", async () => {
    const { buildWebViewHtml } = await import("#core/server/utils/email-templates-mjml");
    const html = buildWebViewHtml({ organization, subject: "S", content: "<p>Hi</p>", emailType: "basic", directusUrl: "https://d", complianceFooter: footer });
    expect(html).toContain("email-compliance-footer");
  });
});

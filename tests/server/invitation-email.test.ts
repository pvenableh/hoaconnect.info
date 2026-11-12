/**
 * The member invitation as the app's own MJML email
 * (core/server/utils/invitation-email.ts, core/server/emails/invitation.mjml):
 *
 *  - the hosted template's subject and wording, every value escaped;
 *  - rendered in the community's branding through the shared layout, with the
 *    accept link as the button and an invitation footer (no Preferences link,
 *    no Unsubscribe: the invitee isn't a member yet);
 *  - sent through sendOrganizationEmail (so the demo guard and the dev
 *    allow-list apply), with the community's sender, and never through the
 *    SendGrid-hosted template.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: any) => ({ op: "readItems", collection, query }),
}));
const sent: any[] = [];
vi.mock("#core/server/utils/sendgrid", async (orig) => ({
  ...(await orig<typeof import("#core/server/utils/sendgrid")>()),
  sendOrganizationEmail: async (m: any) => {
    sent.push(m);
    return { success: true, messageId: "msg-1" };
  },
}));

const ORG = {
  id: "org-oak",
  name: "Oak Court",
  slug: "oak",
  email: "office@oak.test",
  street_address: "1 Elm St",
  city: "Austin",
  state: "TX",
  zip: "78701",
  settings: { from_name: "Oak Court HOA", header_text: "Official Communication of {name}", colors: [{ primary: "#1e3a8a", accent: "#f59e0b" }] },
};
const ACCEPT = "https://app.test/oak/accept-invite?token=abc123";
const INPUT = {
  to: "dana@example.com",
  firstName: "Dana",
  lastName: "Reyes",
  organizationName: "Oak Court",
  invitationUrl: ACCEPT,
  inviterName: "Pat Lee",
  roleName: "Owner",
  expiresAt: "2026-11-19T15:00:00.000Z",
  organizationId: ORG.id,
};

let mod: typeof import("#core/server/utils/invitation-email");
let orgRows: any[];

beforeAll(async () => {
  mod = await import("#core/server/utils/invitation-email");
}, 120_000);

beforeEach(() => {
  sent.length = 0;
  orgRows = [structuredClone(ORG)];
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { appUrl: "https://app.test" }, directus: { url: "https://cms.test" } }));
  vi.stubGlobal("getTypedDirectus", () => ({ request: async () => orgRows }));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("invitationEmailParts", () => {
  it("keeps the hosted template's subject and says who invited whom, as what, until when", () => {
    const p = mod.invitationEmailParts(INPUT);
    expect(p.subject).toBe("You've been invited to join Oak Court");
    expect(p.bodyHtml).toContain("Pat Lee has invited you to join Oak Court as an Owner.");
    expect(mod.invitationEmailParts({ ...INPUT, roleName: "Tenant" }).bodyHtml).toContain("as a Tenant.");
    expect(p.bodyHtml).toContain(ACCEPT);
    expect(p.bodyHtml).toContain("This invitation expires on Thursday, November 19, 2026.");
    expect(p.contentPartial.vars).toMatchObject({ inviterName: "Pat Lee", orgName: "Oak Court", roleName: "Owner", ctaLabel: "Accept Invitation" });
  });

  it("escapes every value it puts in the email", () => {
    const p = mod.invitationEmailParts({ ...INPUT, inviterName: `<img src=x onerror=alert(1)>`, organizationName: `Oak & "Elm"` });
    expect(p.contentPartial.vars.inviterName).toBe("&lt;img src=x onerror=alert(1)&gt;");
    expect(p.contentPartial.vars.orgName).toBe("Oak &amp; &quot;Elm&quot;");
    expect(p.bodyHtml).not.toContain("<img");
  });
});

describe("sendHoaInvitationEmail", () => {
  it("renders the community's branded email with the accept button and sends it as the community", async () => {
    await mod.sendHoaInvitationEmail(INPUT);
    expect(sent).toHaveLength(1);
    const m = sent[0];
    expect(m).toMatchObject({ to: "dana@example.com", toName: "Dana Reyes", subject: "You've been invited to join Oak Court", fromName: "Oak Court HOA", organizationId: ORG.id });
    expect(m.templateId).toBeUndefined();
    expect(m.html).toContain("Official Communication of Oak Court");
    expect(m.html).toContain("You're invited to join Oak Court");
    expect(m.html).toContain(`href="${ACCEPT}"`);
    expect(m.html).toContain("Accept Invitation");
    expect(m.html).toContain("invited this address to its HOA Connect portal");
    expect(m.html).not.toContain(">Preferences<");
    expect(m.html).not.toContain(">Unsubscribe<");
    expect(m.text).toContain(ACCEPT);
    expect(m.text).toContain("Pat Lee has invited you to join Oak Court");
  });

  it("still sends, unbranded, when the community can't be read", async () => {
    orgRows = [];
    await mod.sendHoaInvitationEmail(INPUT);
    expect(sent[0]).toMatchObject({ to: "dana@example.com", subject: "You've been invited to join Oak Court" });
    expect(sent[0].html).toContain(`href="${ACCEPT}"`);
  });
});

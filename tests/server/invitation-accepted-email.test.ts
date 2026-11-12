/**
 * "{member} has joined {community}" as the app's own MJML email
 * (core/server/utils/invitation-accepted-email.ts,
 * core/server/emails/invitation-accepted.mjml):
 *
 *  - the hosted template's subject and wording, every value escaped;
 *  - rendered in the community's branding through the shared layout, with the
 *    member's details and the inviter footer (no Preferences link, no
 *    Unsubscribe: the inviter may be an App Admin with no member row);
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
const INPUT = {
  to: "pat@example.com",
  adminName: "Pat",
  memberName: "Dana Reyes",
  memberEmail: "dana@example.com",
  organizationName: "Oak Court",
  organizationId: ORG.id,
};

let mod: typeof import("#core/server/utils/invitation-accepted-email");
let orgRows: any[];

beforeAll(async () => {
  mod = await import("#core/server/utils/invitation-accepted-email");
}, 120_000);

beforeEach(() => {
  sent.length = 0;
  orgRows = [structuredClone(ORG)];
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { appUrl: "https://app.test" }, directus: { url: "https://cms.test" } }));
  vi.stubGlobal("getTypedDirectus", () => ({ request: async () => orgRows }));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("invitationAcceptedEmailParts", () => {
  it("keeps the hosted template's subject and wording, with the member's details", () => {
    const p = mod.invitationAcceptedEmailParts(INPUT);
    expect(p.subject).toBe("Dana Reyes has joined Oak Court");
    expect(p.bodyHtml).toContain("Great news! Dana Reyes has accepted your invitation and joined Oak Court.");
    expect(p.bodyHtml).toContain("Name: Dana Reyes");
    expect(p.bodyHtml).toContain("Email: dana@example.com");
    expect(p.bodyHtml).toContain("You can view and manage all members from your organization dashboard.");
    expect(p.contentPartial.vars).toMatchObject({ memberName: "Dana Reyes", memberEmail: "dana@example.com", orgName: "Oak Court" });
  });

  it("names the member by email when the caller's name is blank (a bare last name keeps no stray space)", () => {
    expect(mod.invitationAcceptedEmailParts({ ...INPUT, memberName: "  " }).subject).toBe("dana@example.com has joined Oak Court");
    expect(mod.invitationAcceptedEmailParts({ ...INPUT, memberName: "Dana " }).subject).toBe("Dana has joined Oak Court");
  });

  it("escapes every value it puts in the email", () => {
    const p = mod.invitationAcceptedEmailParts({ ...INPUT, memberName: `<img src=x onerror=alert(1)>`, organizationName: `Oak & "Elm"` });
    expect(p.contentPartial.vars.memberName).toBe("&lt;img src=x onerror=alert(1)&gt;");
    expect(p.contentPartial.vars.orgName).toBe("Oak &amp; &quot;Elm&quot;");
    expect(p.contentPartial.vars.heading).not.toContain("<img");
    expect(p.bodyHtml).not.toContain("<img");
  });
});

describe("sendInvitationAcceptedEmail", () => {
  it("renders the community's branded email and sends it to the inviter as the community", async () => {
    await mod.sendInvitationAcceptedEmail(INPUT);
    expect(sent).toHaveLength(1);
    const m = sent[0];
    expect(m).toMatchObject({ to: "pat@example.com", toName: "Pat", subject: "Dana Reyes has joined Oak Court", fromName: "Oak Court HOA", organizationId: ORG.id });
    expect(m.templateId).toBeUndefined();
    expect(m.html).toContain("Official Communication of Oak Court");
    expect(m.html).toContain("Hello Pat,");
    expect(m.html).toContain("Member Details");
    expect(m.html).toContain("dana@example.com");
    expect(m.html).toContain("You receive this because you invited someone to join Oak Court on HOA Connect and they accepted.");
    expect(m.html).not.toContain(">Preferences<");
    expect(m.html).not.toContain(">Unsubscribe<");
    expect(m.text).toContain("Great news! Dana Reyes has accepted your invitation and joined Oak Court.");
    expect(m.text).toContain("Email: dana@example.com");
  });

  it("still sends, unbranded, when the community can't be read", async () => {
    orgRows = [];
    await mod.sendInvitationAcceptedEmail(INPUT);
    expect(sent[0]).toMatchObject({ to: "pat@example.com", subject: "Dana Reyes has joined Oak Court" });
  });
});

/**
 * The welcome to a new HOA Admin as the app's own MJML email
 * (core/server/utils/welcome-email.ts, core/server/emails/welcome.mjml):
 *
 *  - the hosted template's subject and wording, every value escaped;
 *  - rendered in the community's branding through the shared layout, with the
 *    login link as the button and the membership footer (the recipient is one
 *    of the community's HOA Admins);
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
const LOGIN = "https://app.test/dashboard";
const INPUT = {
  to: "dana@example.com",
  firstName: "Dana",
  lastName: "Reyes",
  organizationName: "Oak Court",
  loginUrl: LOGIN,
  organizationId: ORG.id,
};

let mod: typeof import("#core/server/utils/welcome-email");
let orgRows: any[];

beforeAll(async () => {
  mod = await import("#core/server/utils/welcome-email");
}, 120_000);

beforeEach(() => {
  sent.length = 0;
  orgRows = [structuredClone(ORG)];
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { appUrl: "https://app.test" }, directus: { url: "https://cms.test" } }));
  vi.stubGlobal("getTypedDirectus", () => ({ request: async () => orgRows }));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("welcomeEmailParts", () => {
  it("keeps the hosted template's subject and wording", () => {
    const p = mod.welcomeEmailParts(INPUT);
    expect(p.subject).toBe("Welcome to Oak Court!");
    expect(p.bodyHtml).toContain("Your account for Oak Court has been successfully created. You now have administrator access to manage your community.");
    expect(p.bodyHtml).toContain("<li>Track payments and dues</li>");
    expect(p.bodyHtml).toContain(LOGIN);
    expect(p.bodyHtml).toContain("If you have any questions, please reach out to our support team.");
    expect(p.contentPartial.vars).toMatchObject({ orgName: "Oak Court", ctaHref: LOGIN, ctaLabel: "Log In Now" });
  });

  it("escapes every value it puts in the email", () => {
    const p = mod.welcomeEmailParts({ organizationName: `Oak & <b>"Elm"</b>`, loginUrl: `https://x.test/?a=1&b="2"` });
    expect(p.contentPartial.vars.orgName).toBe("Oak &amp; &lt;b&gt;&quot;Elm&quot;&lt;/b&gt;");
    expect(p.contentPartial.vars.ctaHref).toBe("https://x.test/?a=1&amp;b=&quot;2&quot;");
    expect(p.bodyHtml).not.toContain("<b>");
  });
});

describe("sendWelcomeEmail", () => {
  it("renders the community's branded email with the login button and sends it as the community", async () => {
    await mod.sendWelcomeEmail(INPUT);
    expect(sent).toHaveLength(1);
    const m = sent[0];
    expect(m).toMatchObject({ to: "dana@example.com", toName: "Dana Reyes", subject: "Welcome to Oak Court!", fromName: "Oak Court HOA", organizationId: ORG.id });
    expect(m.templateId).toBeUndefined();
    expect(m.html).toContain("Official Communication of Oak Court");
    expect(m.html).toContain("Hello Dana,");
    expect(m.html).toContain("Welcome to Oak Court!");
    expect(m.html).toContain(`href="${LOGIN}"`);
    expect(m.html).toContain("Log In Now");
    expect(m.html).toContain("Manage members and units");
    expect(m.html).toContain("You receive this because you are a member of Oak Court; it cannot be unsubscribed.");
    expect(m.html).toContain("https://app.test/oak/profile#email");
    expect(m.html).not.toContain(">Unsubscribe<");
    expect(m.text).toContain(LOGIN);
    expect(m.text).toContain("• Send announcements and newsletters");
    expect(m.text).toContain("• Access community documents\n\nLog in now: https://app.test/dashboard");
  });

  it("still sends, unbranded, when the community can't be read", async () => {
    orgRows = [];
    await mod.sendWelcomeEmail(INPUT);
    expect(sent[0]).toMatchObject({ to: "dana@example.com", subject: "Welcome to Oak Court!" });
    expect(sent[0].html).toContain(`href="${LOGIN}"`);
  });
});

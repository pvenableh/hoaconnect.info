/**
 * The reminder templates (Earnest parity round 3, Phase 5a): each of
 * reminder-dues / -meeting / -violation / -poll composed through the partials
 * by the real send path (sendBrandedTransactionalEmail), keeping the class
 * footer — "can't be unsubscribed" on the essential two, "these notifications
 * are on" on the others — with the button pointing into the org's portal and
 * every value escaped. Essential mail ignores the category opt-out, never the
 * master switch or a bounce.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore, fakeDirectus } from "./support/email-queue-memory";
import { reminderEmail, REMINDER_EMAIL_TEMPLATES, sampleReminders } from "#core/server/utils/reminder-email";
import type { ComposedReminder } from "#core/shared/reminders/messages";

vi.mock("@directus/sdk", async () => (await import("./support/email-queue-memory")).sdkDescriptors);

const sent: any[] = [];
vi.mock("#core/server/utils/sendgrid", async (orig) => ({
  ...(await orig<typeof import("#core/server/utils/sendgrid")>()),
  sendOrganizationEmail: async (m: any) => {
    sent.push(m);
    return { success: true, messageId: `msg-${sent.length}` };
  },
}));
vi.mock("#core/server/utils/org-members", () => ({ scopeRecipientsToOrg: async (_org: string, ids: string[]) => ids }));

const ORG = {
  id: "org-a", name: "Oak Court", slug: "oak", email: "office@oak.test",
  street_address: "1 Elm St", city: "Austin", state: "TX", zip: "78701",
  settings: { from_name: "Oak Court HOA", colors: [{ primary: "#1e3a8a", secondary: "#1e3a8a", accent: "#f59e0b" }] },
};

const USERS = [
  { id: "u-plain", email: "plain@example.com", first_name: "Pat", email_notifications: true, notification_preferences: null },
  { id: "u-no-payment", email: "nopay@example.com", first_name: "Nia", email_notifications: true, notification_preferences: { payment: false, meeting: false, request: false, announcement: false } },
  { id: "u-no-email", email: "noemail@example.com", first_name: "Ned", email_notifications: false, notification_preferences: null },
  { id: "u-bounced", email: "gone@example.com", first_name: "Gil", email_notifications: true, notification_preferences: null },
];

beforeAll(async () => {
  await import("#core/server/utils/transactional-email");
}, 120_000);

beforeEach(async () => {
  sent.length = 0;
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { appUrl: "https://app.test" }, directus: { url: "https://d.test", staticToken: "t" } }));
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  const directus = fakeDirectus(new MemoryStore(), { org: ORG, members: [{ id: "m4", email: "gone@example.com", email_bounced: true }] });
  const request = directus.request.bind(directus);
  directus.request = async (op: any) => {
    if (op.op === "readItems" && op.collection === "hoa_organizations") return [structuredClone(ORG)];
    if (op.op === "readUsers") {
      const ids: string[] = op.query?.filter?.id?._in ?? [];
      return USERS.filter((u) => ids.includes(u.id));
    }
    return request(op);
  };
  vi.stubGlobal("getTypedDirectus", () => directus);
  (await import("#core/server/utils/email-compliance"))._resetEmailComplianceSchemaCache();
});

async function sendReminderEmail(c: ComposedReminder, to: string[]) {
  const { sendBrandedTransactionalEmail } = await import("#core/server/utils/transactional-email");
  const parts = reminderEmail(c);
  return sendBrandedTransactionalEmail({
    organizationId: ORG.id,
    recipientUserIds: to,
    subject: c.subject,
    heading: parts.heading,
    bodyHtml: parts.bodyHtml,
    cta: parts.cta,
    emailType: parts.emailType,
    category: c.category,
    essential: c.essential,
    contentPartial: parts.contentPartial,
  });
}

const samples = sampleReminders("Oak Court");

describe("the reminder templates, through the partials", () => {
  it("there are four, and the samples are made by the rules", () => {
    expect(REMINDER_EMAIL_TEMPLATES).toEqual(["reminder-dues", "reminder-meeting", "reminder-violation", "reminder-poll"]);
    expect(samples["reminder-dues"]).toMatchObject({ rule: "dues", stage: "before", essential: true });
    expect(samples["reminder-meeting"]).toMatchObject({ rule: "meeting", stage: "week", essential: false });
    expect(samples["reminder-violation"]).toMatchObject({ rule: "violation", stage: "before", essential: true });
    expect(samples["reminder-poll"]).toMatchObject({ rule: "poll", stage: "closing", essential: false });
  });

  it.each([
    ["reminder-dues", ["Total due", "$525.00", "November dues", "Pool resurfacing assessment"], "/payments", "cannot be unsubscribed"],
    ["reminder-meeting", ["Monthly board meeting", "When", "Clubhouse"], "/meetings", "these notifications are on"],
    ["reminder-violation", ["Correct by", "Fri, Nov 6", "Trash bins visible from the street"], "/requests/r1", "cannot be unsubscribed"],
    ["reminder-poll", ["Should we repaint the fence green?", "Voting closes"], "/polls", "these notifications are on"],
  ] as const)("%s: its content, a button into the portal, and the class footer last", async (template, content, path, footer) => {
    await sendReminderEmail(samples[template], ["u-plain"]);
    expect(sent).toHaveLength(1);
    const { html, text, subject } = sent[0];
    expect(subject).toBe(samples[template].subject);
    for (const c of content) expect(html).toContain(c);
    expect(html).toContain(`href="https://app.test/oak${path}"`);
    expect(html).toContain(samples[template].ctaLabel);
    expect(html).toContain("Hello Pat,");
    // The class footer, once, after the copyright — the footer partial's place for it.
    expect(html.split(footer)).toHaveLength(2);
    expect(html.indexOf(footer)).toBeGreaterThan(html.indexOf("All rights reserved"));
    expect(html).toContain("email-compliance-footer");
    // The plain-text part says the same things.
    expect(text).toContain(samples[template].intro);
    expect(text).toContain(footer);
  });

  it("the button takes the brand's accent, with a legible label on it", async () => {
    await sendReminderEmail(samples["reminder-dues"], ["u-plain"]);
    expect(sent[0].html).toMatch(/background:#f59e0b|background-color:#f59e0b|bgcolor="#f59e0b"/);
  });

  it("every value is escaped", async () => {
    const c: ComposedReminder = { ...samples["reminder-violation"], intro: 'Fix <script>alert("x")</script> by Friday', heading: "A & B" };
    c.vars = { ...c.vars, title: "<img src=x onerror=1>" };
    await sendReminderEmail(c, ["u-plain"]);
    expect(sent[0].html).not.toContain("<script>alert");
    expect(sent[0].html).not.toContain("<img src=x");
    expect(sent[0].html).toContain("&lt;script&gt;");
    expect(sent[0].html).toContain("A &amp; B");
  });
});

describe("who gets the email", () => {
  it("essential (dues): the category opt-out doesn't stop it; the master switch and a bounce do", async () => {
    const n = await sendReminderEmail(samples["reminder-dues"], USERS.map((u) => u.id));
    expect(sent.map((m) => m.to)).toEqual(["plain@example.com", "nopay@example.com"]);
    expect(n).toBe(2);
  });

  it("not essential (meeting): the category opt-out holds", async () => {
    await sendReminderEmail(samples["reminder-meeting"], USERS.map((u) => u.id));
    expect(sent.map((m) => m.to)).toEqual(["plain@example.com"]);
  });
});

/**
 * Sender unification (docs/spec-email-send-queue.md §7.4; §10 group H) and
 * the shared renderer's two halves (§8.4): one `resolveSender` for every path
 * that mails for an org, the bounced guard on the direct senders, and the
 * footer sentinel that lets the queue render before it claims.
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolveSender } from "#core/server/utils/sendgrid";
import { essentialEmailAllowed } from "#core/shared/email/email-class";
import { FOOTER_SENTINEL, buildRenderContext, renderDraft, finalizeDraft } from "#core/server/utils/email-send-render";
import { MemoryStore, fakeDirectus, seedSending } from "./support/email-queue-memory";

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

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012-_9";
const ORG = {
  id: "org-a", name: "Oak Court", slug: "oak", email: "office@oak.test",
  street_address: "1 Elm St", city: "Austin", state: "TX", zip: "78701",
  settings: { from_name: "Oak Court HOA", from_email: "news@oak.test", email_domain_verified: true },
};

beforeEach(() => {
  sent.length = 0;
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { appUrl: "https://app.test" },
    directus: { url: "https://d.test", staticToken: "t" },
  }));
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("sender unification (H)", () => {
  it("57. resolveSender: name always, address only when verified, reply_to precedence, platform fallback", () => {
    expect(resolveSender(ORG)).toEqual({ fromName: "Oak Court HOA", fromAddress: "news@oak.test", replyTo: { email: "office@oak.test", name: "Oak Court" } });
    expect(resolveSender({ ...ORG, settings: { ...ORG.settings, email_domain_verified: false } }).fromAddress).toBeUndefined();
    expect(resolveSender({ name: "Oak", settings: { from_name: "  " } }).fromName).toBe("Oak");
    expect(resolveSender({ ...ORG, settings: { ...ORG.settings, reply_to: "board@oak.test" } }).replyTo?.email).toBe("board@oak.test");
    // Settings not expanded (an id) or absent: the org's own name and address, platform sender.
    expect(resolveSender({ name: "Oak", email: null, settings: "settings-id" })).toEqual({ fromName: "Oak", fromAddress: undefined, replyTo: undefined });
    expect(resolveSender(null)).toEqual({ fromName: undefined, fromAddress: undefined, replyTo: undefined });
  });

  describe("58. transactional and billing senders skip bounced members and log; the opt-out is ignored there", () => {
    let directus: ReturnType<typeof fakeDirectus>;
    beforeAll(async () => {
      await import("#core/server/utils/transactional-email");
    }, 120_000);
    beforeEach(async () => {
      const members = [
        { id: "m1", email: "Gone@Example.com", email_bounced: true },
        { id: "m2", email: "out@example.com", email_community_opt_out: true },
      ];
      directus = fakeDirectus(new MemoryStore(), { org: ORG, members });
      const request = directus.request.bind(directus);
      directus.request = async (op: any) => {
        if (op.op === "readItems" && op.collection === "hoa_organizations") return [ORG];
        if (op.op === "readUsers") {
          return [
            { id: "u1", email: "gone@example.com", first_name: "Gone", email_notifications: true },
            { id: "u2", email: "out@example.com", first_name: "Out", email_notifications: true },
          ];
        }
        return request(op);
      };
      vi.stubGlobal("getTypedDirectus", () => directus);
      (await import("#core/server/utils/email-compliance"))._resetEmailComplianceSchemaCache();
    });

    it("transactional: the bounced user gets nothing (logged); the opted-out one is mailed, with the org's sender", async () => {
      const { sendBrandedTransactionalEmail } = await import("#core/server/utils/transactional-email");
      const info = vi.spyOn(console, "info").mockImplementation(() => {});
      await sendBrandedTransactionalEmail({ organizationId: ORG.id, recipientUserIds: ["u1", "u2"], subject: "Task assigned", bodyHtml: "<p>x</p>" } as any);
      expect(sent.map((m) => m.to)).toEqual(["out@example.com"]);
      expect(sent[0]).toMatchObject({ fromName: "Oak Court HOA", fromAddress: "news@oak.test", replyTo: { email: "office@oak.test" } });
      expect(info.mock.calls.flat().join(" ")).toContain("skipped u1: address bounced");
    });

    it("billing: the worker's rule is essentialEmailAllowed (bounced → no email; opted out → email)", () => {
      expect(essentialEmailAllowed({ email_bounced: true })).toBe(false);
      expect(essentialEmailAllowed({ email_community_opt_out: true })).toBe(true);
      expect(essentialEmailAllowed(null)).toBe(true);
      // The worker can't be imported (it runs on load); pin that it uses the rule and resolveSender.
      const src = readFileSync("scripts/billing-worker.ts", "utf8");
      expect(src).toMatch(/const emailAllowed = essentialEmailAllowed\(member\)/);
      expect(src).toMatch(/&& emailAllowed\) \{/);
      expect(src).toMatch(/skipped email → \$\{who\}: address bounced/);
      expect(src).toMatch(/resolveSender\(orgForEmail, "transactional"\)/);
      expect(src).toMatch(/"email_bounced"\] \}\)/);
    });
  });

  it("59. the scheduled path now carries the white-label sender: through the shared render", async () => {
    const store = new MemoryStore();
    const { emailId } = await seedSending(store, 1, { emailId: "e-sched", runKey: "s:2026-11-01T10:00:00.000Z" });
    Object.assign(store.email(emailId), { organization: ORG.id, subject: "Dues", content: "<p>Due</p>", email_type: "notice", include_board_footer: false });
    const directus = fakeDirectus(store, { org: ORG, members: [] });
    vi.stubGlobal("getTypedDirectus", () => directus);
    const { queueRunDeps } = await import("#core/server/utils/email-send-tick");
    const ctx = await queueRunDeps(directus, emailId).load();
    const row = store.rowsOf(emailId)[0]!;
    const prepared = await ctx.prepare([row]);
    const p = prepared.get(row.id)!;
    expect("draft" in p).toBe(true);
    const msg = ctx.finalize(row, (p as any).draft, { id: row.member!, unsubscribe_token: TOKEN });
    expect(msg).toMatchObject({
      fromName: "Oak Court HOA",
      fromAddress: "news@oak.test",
      replyTo: { email: "office@oak.test" },
      customArgs: { email_id: emailId, recipient_id: row.id, run_key: "s:2026-11-01T10:00:00.000Z", organization_id: ORG.id },
    });
  });
});

describe("the shared renderer: render before the claim, finalize after", () => {
  const ctxFor = (over: Partial<Parameters<typeof buildRenderContext>[0]["email"]> = {}, templateId?: string) =>
    buildRenderContext({
      emailId: "e1",
      org: ORG as any,
      emailClass: "community",
      mailingAddress: "1 Elm St, Austin, TX 78701",
      email: { subject: "Hi {{first_name}}", content: "<p>Unit {{unit}}</p>", email_type: "newsletter", web_slug: "hi", ...over },
      boardMembers: [],
      attachments: [],
      config: { appUrl: "https://app.test", directusUrl: "https://d.test", templateId },
    });
  const target = { toEmail: "pat@example.com", toName: "Pat", fields: { first_name: "Pat", unit: "4B" } };

  it.each([
    ["visual (buildEmailHtml)", {}, undefined],
    ["raw MJML", { content_mode: "mjml", content: "<mjml><mj-body><mj-section><mj-column><mj-text>Unit {{unit}}</mj-text></mj-column></mj-section></mj-body></mjml>" }, undefined],
    ["dynamic template", {}, "d-template"],
  ] as const)("%s: the sentinel survives compilation and becomes the recipient's footer and headers", (_name, over, templateId) => {
    const ctx = ctxFor(over as any, templateId);
    const draft = renderDraft(ctx, target);
    expect(draft.msg.html).toContain(FOOTER_SENTINEL);
    expect(draft.msg.text).toContain(FOOTER_SENTINEL);
    expect(draft.msg.headers).toEqual({});

    const msg = finalizeDraft(ctx, draft, TOKEN);
    for (const part of [msg.html, msg.text, JSON.stringify(msg.templateData ?? {})]) expect(part).not.toContain(FOOTER_SENTINEL);
    expect(msg.html).toContain(`https://app.test/unsubscribe?token=${TOKEN}`);
    expect(msg.html).toContain("1 Elm St, Austin, TX 78701");
    expect(msg.text).toContain(`Unsubscribe: https://app.test/unsubscribe?token=${TOKEN}`);
    expect(msg.headers).toEqual({
      "List-Unsubscribe": `<https://app.test/api/email/unsubscribe/one-click?token=${TOKEN}&e=e1>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(msg.subject).toBe("Hi Pat");
    if (templateId) {
      expect(msg.templateData).toMatchObject({ unsubscribe_url: `https://app.test/unsubscribe?token=${TOKEN}&e=e1`, first_name: "Pat", unit: "" });
      expect(msg.templateData!.content).toContain("Unit 4B");
    } else {
      expect(msg.html).toContain("Unit 4B");
    }
  });

  it("a copy (no token) gets the generic page and no List-Unsubscribe header", () => {
    const ctx = ctxFor();
    const msg = finalizeDraft(ctx, renderDraft(ctx, { toEmail: "board@oak.test", fields: {} }), null);
    expect(msg.headers).toEqual({});
    expect(msg.html).toContain("https://app.test/unsubscribe");
    expect(msg.html).not.toContain("token=");
  });

  it("a footer with $ patterns is inserted literally", () => {
    const ctx = { ...ctxFor(), mailingAddress: "1 $& Elm $1 St, Austin" };
    const msg = finalizeDraft(ctx, renderDraft(ctx, target), TOKEN);
    expect(msg.text).toContain("1 $& Elm $1 St, Austin");
    expect(msg.html).toContain("1 $&amp; Elm $1 St, Austin");
  });
});

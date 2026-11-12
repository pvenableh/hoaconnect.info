/**
 * POST /api/email/:id/resend-unknown — a draft for the members SendGrid never
 * reported on, never a send:
 *
 *  - same gate as sending;
 *  - refused while the send runs, and while everyone unknown is inside the hour;
 *  - the draft copies the content, class and attachments, targets exactly the
 *    ready members (custom list), and carries no cc/bcc;
 *  - nothing about the original send or its rows changes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import { MemoryDirectus } from "./support/memory-directus";

const h = vi.hoisted(() => ({ gate: null as null | Error }));

vi.mock("@directus/sdk", async () => (await import("./support/email-queue-memory")).sdkDescriptors);
vi.mock("#core/server/utils/email-send-queue", () => ({ emailQueueSchema: async () => true }));
vi.mock("#core/server/utils/email-compliance", () => ({ emailComplianceSchema: async () => ({ members: true, emailClass: true }) }));
vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);
vi.stubGlobal("createError", (e: any) => Object.assign(new Error(e.message), e));

const route = (await import("#core/server/api/email/[id]/resend-unknown.post")).default as (e: H3Event) => Promise<any>;

const ORG = "org-lenox";
const EMAIL = "email-dues";
const RUN = "m:run-1";
const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

let db: MemoryDirectus;
let emailId: string;

beforeEach(() => {
  h.gate = null;
  emailId = EMAIL;
  db = new MemoryDirectus();
  db.seed("hoa_emails", [
    {
      id: EMAIL,
      organization: ORG,
      status: "sent",
      subject: "November dues",
      content: "<p>Dues are due.</p>",
      email_type: "basic",
      content_mode: "visual",
      greeting: "Hi {{first_name}},",
      salutation: "The Board",
      include_board_footer: true,
      header_text: null,
      footer_image: null,
      email_class: "essential",
      send_run_key: RUN,
      web_slug: "november-dues",
      cc: ["@board"],
      attachments: [{ directus_files_id: "file-pdf" }],
    },
  ]);
  db.seed("hoa_email_recipients", [
    { id: "r1", email: EMAIL, run_key: RUN, kind: "member", member: "m-ann", status: "sent", claimed_at: ago(3 * HOUR) },
    { id: "r2", email: EMAIL, run_key: RUN, kind: "member", member: "m-bo", status: "unknown", claimed_at: ago(2 * HOUR) },
    { id: "r3", email: EMAIL, run_key: RUN, kind: "member", member: "m-cy", status: "unknown", claimed_at: ago(2 * HOUR) },
    { id: "r4", email: EMAIL, run_key: RUN, kind: "copy", member: null, status: "unknown", claimed_at: ago(2 * HOUR) },
    { id: "r5", email: EMAIL, run_key: "m:older", kind: "member", member: "m-old", status: "unknown", claimed_at: ago(48 * HOUR) },
  ]);
  vi.stubGlobal("requireUserSession", async () => ({ user: { id: "u-oscar" } }));
  vi.stubGlobal("getRouterParam", () => emailId);
  vi.stubGlobal("getTypedDirectus", () => db);
  vi.stubGlobal("requireAdminOrManagerGrant", async () => {
    if (h.gate) throw h.gate;
  });
});

const call = () => route({} as H3Event);
const drafts = () => db.all("hoa_emails").filter((e) => e.status === "draft");

describe("resend to the unknown", () => {
  it("makes a draft for exactly the ready members of the latest send, with the content and no cc/bcc", async () => {
    const before = JSON.stringify(db.all("hoa_email_recipients"));
    const res = await call();

    expect(res).toMatchObject({ members: 2, waiting: 0, notResendable: 1 });
    const [draft] = drafts();
    expect(draft).toMatchObject({
      id: res.draftId,
      organization: ORG,
      status: "draft",
      subject: "November dues",
      content: "<p>Dues are due.</p>",
      greeting: "Hi {{first_name}},",
      email_class: "essential",
      recipient_filter: "custom",
      recipient_ids: ["m-bo", "m-cy"],
      attachments: [{ directus_files_id: "file-pdf" }],
      cc: null,
      bcc: null,
      recurrence_rule: "none",
    });
    expect(draft!.web_slug).not.toBe("november-dues");
    // The original and its rows are untouched.
    expect(db.one("hoa_emails", EMAIL)).toMatchObject({ status: "sent", cc: ["@board"] });
    expect(JSON.stringify(db.all("hoa_email_recipients"))).toBe(before);
  });

  it("refuses while everyone unknown is still inside the hour, and says when", async () => {
    for (const r of db.all("hoa_email_recipients")) if (r.status === "unknown") r.claimed_at = ago(20 * 60 * 1000);
    await expect(call()).rejects.toMatchObject({ statusCode: 409, data: { code: "not_ready" } });
    expect(drafts()).toHaveLength(0);
  });

  it("refuses a send that is still running, and a send with nobody unknown", async () => {
    db.one("hoa_emails", EMAIL)!.status = "sending";
    await expect(call()).rejects.toMatchObject({ statusCode: 409, data: { code: "not_finished" } });
    db.one("hoa_emails", EMAIL)!.status = "sent";
    for (const r of db.all("hoa_email_recipients")) r.status = "sent";
    await expect(call()).rejects.toMatchObject({ statusCode: 409, data: { code: "none_unknown" } });
    expect(drafts()).toHaveLength(0);
  });

  it("answers the sending gate's refusal and writes nothing", async () => {
    h.gate = Object.assign(new Error("Forbidden"), { statusCode: 403 });
    await expect(call()).rejects.toMatchObject({ statusCode: 403 });
    expect(drafts()).toHaveLength(0);
  });

  it("404 for an email that doesn't exist", async () => {
    emailId = "nope";
    await expect(call()).rejects.toMatchObject({ statusCode: 404 });
  });
});

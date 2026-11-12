/**
 * Failed sends (core/shared/email/failed-sends.ts):
 *
 * POST /api/email/:id/retry-failed — a draft for the members whose row failed,
 * never a send: same gate as sending; refused while the send runs and when
 * nobody failed; the draft copies the content, class and attachments, targets
 * exactly those members, and carries no cc/bcc; the original is untouched.
 *
 * DELETE /api/email/:id — a draft, or a failed send that reached nobody, with
 * its recipient rows. Anything a member was sent stays.
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

const retry = (await import("#core/server/api/email/[id]/retry-failed.post")).default as (e: H3Event) => Promise<any>;
const remove = (await import("#core/server/api/email/[id].delete")).default as (e: H3Event) => Promise<any>;

const ORG = "org-lenox";
const EMAIL = "email-test";
const RUN = "m:run-2";
const WHY = "400: The template_id must be a valid GUID";

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
      status: "failed",
      subject: "Pool closing",
      content: "<p>The pool closes Friday.</p>",
      email_type: "basic",
      content_mode: "visual",
      greeting: "Hi {{first_name}},",
      salutation: null,
      include_board_footer: true,
      header_text: null,
      footer_image: null,
      email_class: "community",
      send_run_key: RUN,
      web_slug: "pool-closing",
      cc: ["@board"],
      attachments: [{ directus_files_id: "file-pdf" }],
    },
    { id: "email-other", organization: ORG, status: "sent", subject: "Other", web_slug: "other", send_run_key: "m:x" },
  ]);
  db.seed("hoa_email_recipients", [
    { id: "r1", email: EMAIL, run_key: RUN, kind: "member", member: "m-ann", status: "failed", error_message: WHY },
    { id: "r2", email: EMAIL, run_key: RUN, kind: "member", member: "m-bo", status: "failed", error_message: WHY },
    { id: "r3", email: EMAIL, run_key: RUN, kind: "copy", member: null, status: "failed", error_message: WHY },
    { id: "r4", email: EMAIL, run_key: RUN, kind: "member", member: "m-cy", status: "suppressed" },
    { id: "r5", email: EMAIL, run_key: "m:older", kind: "member", member: "m-old", status: "failed", error_message: WHY },
    { id: "r9", email: "email-other", run_key: "m:x", kind: "member", member: "m-ann", status: "sent" },
  ]);
  vi.stubGlobal("requireUserSession", async () => ({ user: { id: "u-oscar" } }));
  vi.stubGlobal("getRouterParam", () => emailId);
  vi.stubGlobal("getTypedDirectus", () => db);
  vi.stubGlobal("requireAdminOrManagerGrant", async () => {
    if (h.gate) throw h.gate;
  });
});

const drafts = () => db.all("hoa_emails").filter((e) => e.status === "draft");
const rowsOf = (id: string) => db.all("hoa_email_recipients").filter((r) => r.email === id);

describe("retry the failed", () => {
  it("makes a draft for exactly the failed members of the latest send, with the content and no cc/bcc", async () => {
    const before = JSON.stringify(db.all("hoa_email_recipients"));
    const res = await retry({} as H3Event);

    expect(res).toMatchObject({ members: 2, notRetryable: 1 });
    const [draft] = drafts();
    expect(draft).toMatchObject({
      id: res.draftId,
      organization: ORG,
      status: "draft",
      subject: "Pool closing",
      content: "<p>The pool closes Friday.</p>",
      email_class: "community",
      recipient_filter: "custom",
      recipient_ids: ["m-ann", "m-bo"],
      attachments: [{ directus_files_id: "file-pdf" }],
      cc: null,
      bcc: null,
      recurrence_rule: "none",
    });
    expect(draft!.web_slug).not.toBe("pool-closing");
    // The original and its rows are untouched.
    expect(db.one("hoa_emails", EMAIL)).toMatchObject({ status: "failed", cc: ["@board"] });
    expect(JSON.stringify(db.all("hoa_email_recipients"))).toBe(before);
  });

  it("works on a send that mostly went out", async () => {
    db.one("hoa_emails", EMAIL)!.status = "sent";
    db.one("hoa_email_recipients", "r2")!.status = "sent";
    const res = await retry({} as H3Event);
    expect(res.members).toBe(1);
    expect(drafts()[0]!.recipient_ids).toEqual(["m-ann"]);
  });

  it("refuses a send that is still running, and a send where nobody failed", async () => {
    db.one("hoa_emails", EMAIL)!.status = "sending";
    await expect(retry({} as H3Event)).rejects.toMatchObject({ statusCode: 409, data: { code: "not_finished" } });
    db.one("hoa_emails", EMAIL)!.status = "sent";
    for (const r of rowsOf(EMAIL)) r.status = "sent";
    await expect(retry({} as H3Event)).rejects.toMatchObject({ statusCode: 409, data: { code: "none_failed" } });
    expect(drafts()).toHaveLength(0);
  });

  it("answers the sending gate's refusal and writes nothing; 404 for an email that doesn't exist", async () => {
    h.gate = Object.assign(new Error("Forbidden"), { statusCode: 403 });
    await expect(retry({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(drafts()).toHaveLength(0);
    h.gate = null;
    emailId = "nope";
    await expect(retry({} as H3Event)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("removing an email", () => {
  it("removes a failed send that reached nobody, with every one of its rows and nobody else's", async () => {
    await expect(remove({} as H3Event)).resolves.toMatchObject({ success: true });
    expect(db.one("hoa_emails", EMAIL)).toBeFalsy();
    expect(rowsOf(EMAIL)).toHaveLength(0);
    expect(rowsOf("email-other")).toHaveLength(1);
    expect(db.one("hoa_emails", "email-other")).toBeTruthy();
  });

  it("keeps a failed email when an earlier occurrence, or one row, was accepted", async () => {
    db.one("hoa_email_recipients", "r5")!.status = "sent";
    await expect(remove({} as H3Event)).rejects.toMatchObject({ statusCode: 400, data: { code: "kept_for_records" } });
    expect(db.one("hoa_emails", EMAIL)).toBeTruthy();
    expect(rowsOf(EMAIL)).toHaveLength(5);
  });

  it("keeps a sent email, and refuses one that is sending", async () => {
    emailId = "email-other";
    await expect(remove({} as H3Event)).rejects.toMatchObject({ statusCode: 400, data: { code: "kept_for_records" } });
    db.one("hoa_emails", "email-other")!.status = "sending";
    await expect(remove({} as H3Event)).rejects.toMatchObject({ statusCode: 409, data: { code: "send_in_progress" } });
    expect(rowsOf("email-other")).toHaveLength(1);
  });

  it("still removes a draft, and still answers the gate first", async () => {
    db.one("hoa_emails", EMAIL)!.status = "draft";
    h.gate = Object.assign(new Error("Forbidden"), { statusCode: 403 });
    await expect(remove({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
    expect(db.one("hoa_emails", EMAIL)).toBeTruthy();
    h.gate = null;
    await expect(remove({} as H3Event)).resolves.toMatchObject({ success: true });
    expect(db.one("hoa_emails", EMAIL)).toBeFalsy();
  });
});

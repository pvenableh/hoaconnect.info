// POST /api/org/export/:id/ready-email — the data-export worker asks the app to
// send the "your export is ready" email, because the worker can't load the
// email templates. Cron secret only; only a READY export's requester; no
// category, so only the app's master switch, the mute or a bounce stops it.
import { beforeEach, describe, expect, it, vi } from "vitest";

let row: any;
let secretOk: boolean;
let sendEmail: ReturnType<typeof vi.fn>;

vi.mock("#core/server/utils/cron-auth", () => ({ cronSecretMatches: () => secretOk }));
vi.mock("#core/server/utils/transactional-email", () => ({
  sendBrandedTransactionalEmail: (...a: unknown[]) => sendEmail(...a),
}));
vi.stubGlobal("defineEventHandler", (fn: any) => fn);
vi.stubGlobal("getRouterParam", () => "exp-1");
vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.statusMessage), o));
vi.stubGlobal("getTypedDirectus", () => ({
  request: async () => {
    if (!row) throw new Error("404");
    return row;
  },
}));

const handler = (await import("#core/server/api/org/export/[id]/ready-email.post")).default as any;

const READY = {
  id: "exp-1",
  status: "ready",
  tier: "shareable",
  requested_by: "u1",
  expires_at: "2026-11-17T12:00:00.000Z",
  organization: { id: "org-1", name: "Oak Court", slug: "oak" },
};

beforeEach(() => {
  row = { ...READY };
  secretOk = true;
  sendEmail = vi.fn(async () => 1);
});

describe("POST /api/org/export/:id/ready-email", () => {
  it("refuses a caller without the cron secret", async () => {
    secretOk = false;
    await expect(handler({})).rejects.toMatchObject({ statusCode: 401 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("emails the requester of a ready export, with no category and not as essential", async () => {
    expect(await handler({})).toEqual({ sent: 1 });
    const opts = sendEmail.mock.calls[0][0];
    expect(opts).toMatchObject({
      organizationId: "org-1",
      recipientUserIds: ["u1"],
      subject: "Your Oak Court data export is ready",
      cta: { label: "Download your export", path: "/admin/settings/data" },
    });
    expect(opts.category).toBeUndefined();
    expect(opts.essential).toBeUndefined();
  });

  it("sends nothing for an export that isn't ready or has no requester", async () => {
    row = { ...READY, status: "running" };
    expect(await handler({})).toEqual({ sent: 0, reason: "not-ready" });
    row = { ...READY, requested_by: null };
    expect(await handler({})).toEqual({ sent: 0, reason: "not-ready" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("404s an unknown export", async () => {
    row = null;
    await expect(handler({})).rejects.toMatchObject({ statusCode: 404 });
  });
});

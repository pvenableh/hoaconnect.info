/**
 * The email twin of the bell, and the one that actually leaves the building.
 *
 * Everything `sendBrandedTransactionalEmail` renders is THIS community's — its
 * name, its header line, its footer photo, its legal line, its portal links —
 * so a recipient id belonging to another community produces a real, on-brand
 * message from a community the person has nothing to do with. A stray bell row
 * is noise inside an app; this one lands in an inbox and cannot be recalled.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: unknown) => ({ op: "read", collection, query }),
  readUsers: (query: unknown) => ({ op: "readUsers", collection: "directus_users", query }),
}));

const sent: Array<{ to: string; subject: string; organizationId: string }> = [];
vi.mock("#core/server/utils/sendgrid", () => ({
  sendOrganizationEmail: async (m: any) => {
    sent.push({ to: m.to, subject: m.subject, organizationId: m.organizationId });
  },
}));
vi.mock("#core/server/utils/email-branding", () => ({
  resolveEmailBranding: () => ({ headerText: null, footerImage: null, homepageUrl: null }),
}));
// Only the two builders are stubbed — `resolveEmailFonts` comes through real,
// so the font stack this module puts on the heading line is the true one rather
// than a stand-in that would assert nothing.
vi.mock("#core/server/utils/email-templates-mjml", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#core/server/utils/email-templates-mjml")>()),
  buildEmailHtml: () => "<html>x</html>",
  buildEmailText: () => "x",
}));

const ORG = "org-1";

type Op = { op: string; collection: string; query?: any };

let ops: Op[];
let members: string[];
let failMembershipRead: boolean;
let logs: unknown[][];

// Pay the cold import ONCE, here, rather than charging it to whichever test
// happens to run first. Unlike its notify twin this file genuinely needs the
// MJML module — `resolveEmailFonts` comes through real on purpose — so the
// import cannot be made cheap, only moved somewhere it is not racing a
// per-test deadline.
//
// It used to race one, and lose, under full-suite parallelism. vitest gives up
// on a timed-out test but cannot cancel it, so the abandoned send landed in the
// NEXT test's freshly-cleared `sent` array — which is why the second test
// failed reporting two copies of the same recipient.
beforeAll(async () => {
  await import("#core/server/utils/transactional-email");
});

beforeEach(() => {
  vi.resetModules();
  ops = [];
  sent.length = 0;
  members = [];
  failMembershipRead = false;
  logs = [];

  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { appUrl: "https://app.example" },
    directus: { url: "https://directus.example" },
  }));
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (desc: Op) => {
      ops.push(desc);
      if (desc.collection === "hoa_members") {
        if (failMembershipRead) throw new Error("membership read exploded");
        const wanted: string[] = desc.query?.filter?.user?._in ?? [];
        return members.filter((m) => wanted.includes(m)).map((user) => ({ user }));
      }
      if (desc.collection === "hoa_organizations") {
        return [{ id: ORG, name: "Harborview Lofts", slug: "harborview", settings: null }];
      }
      if (desc.op === "readUsers") {
        const wanted: string[] = desc.query?.filter?.id?._in ?? [];
        return wanted.map((id) => ({
          id,
          email: `${id}@example.test`,
          first_name: id,
          email_notifications: true,
          notification_preferences: null,
        }));
      }
      return { ok: true };
    },
  }));
  vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => void logs.push(a));
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void logs.push(a));
});

const load = async () =>
  (await import("#core/server/utils/transactional-email")).sendBrandedTransactionalEmail;

const mail = (recipientUserIds: string[]) => ({
  organizationId: ORG,
  recipientUserIds,
  subject: "New task: paint the lobby",
  bodyHtml: "<p>hello</p>",
});

describe("who gets the email", () => {
  it("emails a member of this community", async () => {
    members = ["insider"];
    const send = await load();
    await send(mail(["insider"]));

    expect(sent.map((s) => s.to)).toEqual(["insider@example.test"]);
  });

  it("does not email someone with no membership here", async () => {
    members = ["insider"];
    const send = await load();
    await send(mail(["insider", "outsider"]));

    expect(sent.map((s) => s.to)).toEqual(["insider@example.test"]);
  });

  it("sends nothing, and loads no org branding, when every recipient is an outsider", async () => {
    members = [];
    const send = await load();
    await send(mail(["outsider"]));

    expect(sent).toHaveLength(0);
    expect(ops.some((o) => o.collection === "hoa_organizations")).toBe(false);
  });

  it("sends to nobody when the membership lookup fails", async () => {
    members = ["insider"];
    failMembershipRead = true;
    const send = await load();
    await send(mail(["insider"]));

    expect(sent).toHaveLength(0);
  });

  it("checks membership before looking anything else up", async () => {
    members = ["insider"];
    const send = await load();
    await send(mail(["insider"]));

    expect(ops[0].collection).toBe("hoa_members");
  });

  it("still honours excludeUserId", async () => {
    members = ["a", "b"];
    const send = await load();
    await send({ ...mail(["a", "b"]), excludeUserId: "a" });

    expect(sent.map((s) => s.to)).toEqual(["b@example.test"]);
  });
});

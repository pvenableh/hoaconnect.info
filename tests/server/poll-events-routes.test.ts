/**
 * The poll routes' notification events (Earnest parity round 3, Phase 5b): a
 * poll put to the community tells it (create open, a draft opened), a poll
 * closed by hand records WHEN it closed — `closes_at`, the engine's anchor for
 * the "closed" stage — and tells it, and none of that fails the poll.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@directus/sdk", () => ({
  createItem: (collection: string, data: any) => ({ cmd: "createItem", collection, data }),
  updateItem: (collection: string, id: string, data: any) => ({ cmd: "updateItem", collection, id, data }),
}));

const ORG = "org-1";
const NOW = Date.parse("2026-11-03T14:30:00Z");
const HOUR = 3_600_000;

let body: any;
let poll: any;
let writes: any[];
let audited: any[];
let notified: any[];

beforeAll(() => {
  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("readBody", async () => body);
  vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.statusMessage || o.message), o));
  vi.stubGlobal("requireUserSession", async () => ({ user: { id: "admin-1", first_name: "Dana", last_name: "Ruiz" } }));
  vi.stubGlobal("resolveOrgId", async (i: any) => String(i.orgId ?? ""));
  vi.stubGlobal("requirePollManage", async () => {});
  vi.stubGlobal("readOrgPoll", async () => poll);
  vi.stubGlobal("readOrgName", async () => "Demo HOA");
  vi.stubGlobal("readPollTally", async () => ({ results: [], votesCast: 0, voters: 0 }));
  vi.stubGlobal("ledgerActorFromSession", () => ({ userId: "admin-1", name: "Dana Ruiz", email: null }));
  vi.stubGlobal("writeAuditEntry", async (e: any) => {
    audited.push(e);
  });
  vi.stubGlobal("notifyReminderEvent", async (...args: unknown[]) => {
    notified.push(args);
    return null;
  });
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (cmd: any) => {
      writes.push(cmd);
      return cmd.cmd === "createItem" ? { id: "p-new" } : {};
    },
  }));
});

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  body = { orgId: ORG, pollId: "p1" };
  poll = { id: "p1", title: "Repaint the fence?", status: "open", allow_multiple: false, closes_at: null };
  writes = [];
  audited = [];
  notified = [];
});

const call = async (path: string) => ((await import(path)).default as (e: unknown) => Promise<any>)({});
const closeIt = () => call("#core/server/api/org/polls/close.post");
const lastUpdate = () => writes.find((w) => w.cmd === "updateItem" && w.collection === "hoa_polls");

describe("POST /api/org/polls/close", () => {
  it("closes a poll with no close time at the moment it closed, and tells the community", async () => {
    const res = await closeIt();
    expect(res.closed).toBe(true);
    expect(lastUpdate().data).toEqual({ status: "closed", closes_at: new Date(NOW).toISOString() });
    expect(notified).toEqual([[ORG, { collection: "hoa_polls", id: "p1" }, "closed"]]);
    expect(audited).toHaveLength(1);
  });

  it("a scheduled close still ahead becomes the moment it was actually closed", async () => {
    poll.closes_at = new Date(NOW + 2 * 24 * HOUR).toISOString();
    await closeIt();
    expect(lastUpdate().data.closes_at).toBe(new Date(NOW).toISOString());
  });

  it("a scheduled close that just passed is the close — left alone", async () => {
    poll.closes_at = new Date(NOW - 5 * HOUR).toISOString();
    await closeIt();
    expect(lastUpdate().data).toEqual({ status: "closed" });
    expect(notified).toHaveLength(1);
  });

  it("a scheduled close too long gone for the engine's window is restamped, so the result is still announced", async () => {
    poll.closes_at = new Date(NOW - 41 * HOUR).toISOString();
    await closeIt();
    expect(lastUpdate().data.closes_at).toBe(new Date(NOW).toISOString());
    poll.closes_at = new Date(NOW - 39 * HOUR).toISOString();
    writes = [];
    await closeIt();
    expect(lastUpdate().data).toEqual({ status: "closed" });
  });

  it("an already-closed poll is a no-op: no write, no ledger row, no notification", async () => {
    poll.status = "closed";
    const res = await closeIt();
    expect(res.closed).toBe(false);
    expect(writes).toEqual([]);
    expect(notified).toEqual([]);
  });

  it("is announced after the ledger row, whether or not the row could be written", async () => {
    vi.stubGlobal("writeAuditEntry", async () => {
      throw new Error("ledger down");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await closeIt();
    expect(res).toMatchObject({ closed: true, recorded: false });
    expect(notified).toHaveLength(1);
    vi.stubGlobal("writeAuditEntry", async (e: any) => {
      audited.push(e);
    });
  });
});

describe("POST /api/org/polls/create", () => {
  const create = () => call("#core/server/api/org/polls/create.post");
  const options = [{ label: "Yes" }, { label: "No" }];

  it("an open poll tells the community", async () => {
    body = { orgId: ORG, title: "Repaint?", options };
    expect(await create()).toEqual({ id: "p-new", status: "open" });
    expect(notified).toEqual([[ORG, { collection: "hoa_polls", id: "p-new" }, "opened"]]);
  });

  it("a draft says nothing", async () => {
    body = { orgId: ORG, title: "Repaint?", options, status: "draft" };
    expect(await create()).toEqual({ id: "p-new", status: "draft" });
    expect(notified).toEqual([]);
  });
});

describe("POST /api/org/polls/reopen", () => {
  const reopen = () => call("#core/server/api/org/polls/reopen.post");

  it("opening a draft is asking the community for the first time: it hears of it", async () => {
    poll.status = "draft";
    expect(await reopen()).toMatchObject({ reopened: true });
    expect(notified).toEqual([[ORG, { collection: "hoa_polls", id: "p1" }, "opened"]]);
  });

  it("reopening a closed poll is a correction, not news", async () => {
    poll.status = "closed";
    expect(await reopen()).toMatchObject({ reopened: true });
    expect(notified).toEqual([]);
    expect(audited).toHaveLength(1);
  });

  it("an open poll is a no-op", async () => {
    expect(await reopen()).toMatchObject({ reopened: false });
    expect(writes).toEqual([]);
    expect(notified).toEqual([]);
  });
});

/**
 * useBoardroomSession — the Board Room's multiplayer transport.
 *
 * The three Board Room collections are admin-only, so nothing in a browser can
 * be *pushed* a `revision` bump: the room polls. That makes the poll's
 * behaviour a contract rather than an implementation detail, and three parts of
 * it are easy to get quietly wrong:
 *
 *   · the `since` handshake — a tick that reports no change must not drag the
 *     steps back down the wire, or "cheap on the quiet path" is a comment
 *     rather than a fact;
 *   · a hidden tab must ask nothing at all, because a Board Room left open on a
 *     second monitor overnight would otherwise bill a request every 5 seconds;
 *   · the room must stop asking once the host has ended it.
 *
 * The verbs are tested for the one thing they all share: every op reaches the
 * single in-room door, and the composable takes the row that comes back rather
 * than patching its own copy.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ref, effectScope } from "vue";

let getCalls: Array<{ url: string; query: any }>;
let postCalls: Array<{ url: string; body: any }>;
let sessionRow: any;
let steps: any[];
let visibility: string;

const SESSION = (over: Record<string, any> = {}) => ({
  id: "s1",
  organizationId: "org-1",
  hostId: "user-me",
  presenterId: "user-me",
  title: "Money",
  status: "live",
  scopeType: "org",
  entityType: null,
  entityId: null,
  subject: "money",
  topic: null,
  planId: "plan-1",
  currentSlide: 0,
  revision: 3,
  lastActivity: null,
  attendees: [{ userId: "user-me", name: "Dana", role: "host", status: "active", lastSeen: null }],
  viewOnly: false,
  dateCreated: null,
  ...over,
});

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  getCalls = [];
  postCalls = [];
  steps = [{ id: "a1", actionType: "create_task", title: "Order chlorine", status: "pending" }];
  sessionRow = SESSION();
  visibility = "visible";

  vi.stubGlobal("document", {
    get visibilityState() {
      return visibility;
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });

  vi.stubGlobal("$fetch", async (url: string, opts: any = {}) => {
    if (opts.method === "POST") {
      postCalls.push({ url, body: opts.body });
      if (url === "/api/ai/director/sessions") {
        return { sessionId: sessionRow.id, session: sessionRow, provisioned: true };
      }
      return { ok: true, session: sessionRow };
    }
    getCalls.push({ url, query: opts.query });
    if (url === "/api/ai/director/sessions") return { sessions: [sessionRow] };
    const since = opts.query?.since;
    const unchanged = since !== undefined && Number(since) === sessionRow.revision;
    return {
      session: sessionRow,
      revision: sessionRow.revision,
      changed: !unchanged,
      steps: unchanged ? null : steps,
    };
  });
});

const load = async () =>
  (await import("#core/app/composables/useBoardroomSession")).useBoardroomSession;

/** Run the composable inside a scope so its onScopeDispose has somewhere to go. */
function inScope<T>(fn: () => T): { value: T; stop: () => void } {
  const scope = effectScope();
  const value = scope.run(fn)!;
  return { value, stop: () => scope.stop() };
}

describe("useBoardroomSession — convening and joining", () => {
  it("does nothing without a community", async () => {
    const useBoardroomSession = await load();
    const { value: room, stop } = inScope(() => useBoardroomSession(ref("")));
    expect(await room.convene()).toBeNull();
    expect(postCalls).toEqual([]);
    stop();
  });

  it("opens a room and starts from the revision it was handed", async () => {
    const useBoardroomSession = await load();
    const { value: room, stop } = inScope(() => useBoardroomSession(ref("org-1")));
    await room.convene({ subject: "money", title: "Money" });
    expect(postCalls[0]).toMatchObject({
      url: "/api/ai/director/sessions",
      body: { orgId: "org-1", subject: "money", title: "Money" },
    });
    expect(room.revision.value).toBe(3);
    expect(room.isLive.value).toBe(true);
    stop();
  });

  it("says so plainly when the meeting store is not provisioned", async () => {
    vi.stubGlobal("$fetch", async () => ({ sessionId: null, session: null, provisioned: false }));
    const useBoardroomSession = await load();
    const { value: room, stop } = inScope(() => useBoardroomSession(ref("org-1")));
    expect(await room.convene()).toBeNull();
    expect(room.error.value).toMatch(/not set up/i);
    stop();
  });

  it("seats you first and only then looks at the room", async () => {
    const useBoardroomSession = await load();
    const { value: room, stop } = inScope(() => useBoardroomSession(ref("org-1")));
    await room.join("s1");
    expect(postCalls[0]).toMatchObject({
      url: "/api/ai/director/sessions/s1",
      body: { orgId: "org-1", op: "join" },
    });
    expect(room.attendees.value).toHaveLength(1);
    stop();
  });

  it("drops people who left out of the count at the table", async () => {
    sessionRow = SESSION({
      attendees: [
        { userId: "user-me", name: "Dana", role: "host", status: "active", lastSeen: null },
        { userId: "user-them", name: "Sam", role: "member", status: "left", lastSeen: null },
      ],
    });
    const useBoardroomSession = await load();
    const { value: room, stop } = inScope(() => useBoardroomSession(ref("org-1")));
    await room.convene();
    expect(room.attendees.value.map((a: any) => a.userId)).toEqual(["user-me"]);
    stop();
  });
});

describe("useBoardroomSession — the in-room verbs", () => {
  it("sends every verb through the one door", async () => {
    const useBoardroomSession = await load();
    const { value: room, stop } = inScope(() => useBoardroomSession(ref("org-1")));
    await room.convene();
    postCalls.length = 0;
    await room.attachPlan("plan-2", "Requests");
    await room.present(2);
    await room.reportDecision("a1");
    expect(postCalls.map((c) => c.url)).toEqual([
      "/api/ai/director/sessions/s1",
      "/api/ai/director/sessions/s1",
      "/api/ai/director/sessions/s1",
    ]);
    expect(postCalls.map((c) => c.body.op)).toEqual(["plan", "present", "activity"]);
    expect(postCalls[2]!.body.stepId).toBe("a1");
    stop();
  });

  it("reports a decision by id only — the room's line is the server's to write", async () => {
    const useBoardroomSession = await load();
    const { value: room, stop } = inScope(() => useBoardroomSession(ref("org-1")));
    await room.convene();
    postCalls.length = 0;
    await room.reportDecision("a1");
    expect(Object.keys(postCalls[0]!.body).sort()).toEqual(["op", "orgId", "stepId"]);
    stop();
  });

  it("forgets the room after ending it, and stops asking about it", async () => {
    const useBoardroomSession = await load();
    const { value: room, stop } = inScope(() => useBoardroomSession(ref("org-1")));
    await room.convene();
    await room.end();
    expect(room.session.value).toBeNull();
    getCalls.length = 0;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(getCalls).toEqual([]);
    stop();
  });

  it("does nothing at all when there is no room to act on", async () => {
    const useBoardroomSession = await load();
    const { value: room, stop } = inScope(() => useBoardroomSession(ref("org-1")));
    expect(await room.reportDecision("a1")).toBeNull();
    expect(postCalls).toEqual([]);
    stop();
  });
});

describe("useBoardroomSession — the poll", () => {
  it("asks with the revision it already has, and gets nothing back for it", async () => {
    const useBoardroomSession = await load();
    const { value: room, stop } = inScope(() => useBoardroomSession(ref("org-1")));
    await room.convene();
    getCalls.length = 0;
    room.remoteSteps.value = null;

    await vi.advanceTimersByTimeAsync(5_000);
    expect(getCalls[0]).toMatchObject({
      url: "/api/ai/director/sessions/s1",
      query: { orgId: "org-1", since: 3 },
    });
    // Nothing changed, so nothing came down the wire and nothing was applied.
    expect(room.remoteSteps.value).toBeNull();
    stop();
  });

  it("takes the steps the moment the revision moves", async () => {
    const useBoardroomSession = await load();
    const { value: room, stop } = inScope(() => useBoardroomSession(ref("org-1")));
    await room.convene();

    sessionRow = SESSION({ revision: 4 });
    steps = [{ id: "a1", actionType: "create_task", title: "Order chlorine", status: "executed" }];
    await vi.advanceTimersByTimeAsync(5_000);

    expect(room.revision.value).toBe(4);
    expect(room.remoteSteps.value?.[0]).toMatchObject({ id: "a1", status: "executed" });
    stop();
  });

  it("asks nothing while the tab is hidden", async () => {
    const useBoardroomSession = await load();
    const { value: room, stop } = inScope(() => useBoardroomSession(ref("org-1")));
    await room.convene();
    getCalls.length = 0;

    visibility = "hidden";
    await vi.advanceTimersByTimeAsync(30_000);
    expect(getCalls).toEqual([]);

    visibility = "visible";
    await vi.advanceTimersByTimeAsync(5_000);
    expect(getCalls).toHaveLength(1);
    stop();
  });

  it("stops asking once the host has ended the meeting elsewhere", async () => {
    const useBoardroomSession = await load();
    const { value: room, stop } = inScope(() => useBoardroomSession(ref("org-1")));
    await room.convene();

    sessionRow = SESSION({ revision: 4, status: "ended" });
    await vi.advanceTimersByTimeAsync(5_000);
    getCalls.length = 0;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(getCalls).toEqual([]);
    stop();
  });

  it("survives a dropped tick and recovers on the next one", async () => {
    const useBoardroomSession = await load();
    const { value: room, stop } = inScope(() => useBoardroomSession(ref("org-1")));
    await room.convene();

    const good = globalThis.$fetch as any;
    let fail = true;
    vi.stubGlobal("$fetch", async (url: string, opts: any = {}) => {
      if (fail && opts.method !== "POST") throw new Error("network");
      return good(url, opts);
    });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(room.session.value).not.toBeNull();

    fail = false;
    sessionRow = SESSION({ revision: 5 });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(room.revision.value).toBe(5);
    stop();
  });

  it("stops polling when its scope goes away", async () => {
    const useBoardroomSession = await load();
    const { value: room, stop } = inScope(() => useBoardroomSession(ref("org-1")));
    await room.convene();
    stop();
    getCalls.length = 0;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(getCalls).toEqual([]);
  });
});

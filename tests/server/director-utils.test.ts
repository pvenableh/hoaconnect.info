/**
 * The three Board Room stores — briefings, sessions, minutes.
 *
 * What is worth pinning here is not "does createItem get called". It is the
 * three ways this layer can silently lie:
 *
 *   · THE CACHE KEY. Writer and reader derive it from one function. If they
 *     ever stopped agreeing, nothing would break loudly — every reopen would
 *     just miss, redraft, and bill the wallet again for an answer already on
 *     disk. So the identity is asserted through the real save and the real
 *     load, not by calling the key function twice.
 *
 *   · THE TTL. A briefing snapshots live community state. Serving one from last
 *     week is worse than drawing a fresh one, because it looks current.
 *
 *   · AN UNPROVISIONED STORE. Until create:boardroom is run on a given Directus
 *     these collections do not exist, and the Board Room must degrade rather
 *     than 500 — save returns null, load returns null, and the planner simply
 *     drafts fresh every time.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItem: (collection: string, id: string, query?: unknown) => ({
    op: "readOne",
    collection,
    id,
    query,
  }),
  readItems: (collection: string, query?: unknown) => ({ op: "read", collection, query }),
  createItem: (collection: string, payload: unknown) => ({ op: "create", collection, payload }),
  updateItem: (collection: string, id: string, payload: unknown) => ({
    op: "updateOne",
    collection,
    id,
    payload,
  }),
}));

const HOME = "org-home";
const OTHER = "org-other";
const ME = "user-me";

type Op = { op: string; collection: string; [k: string]: any };

let rows: Record<string, any[]>;
let missingCollections: Set<string>;
let nextId: number;

/** Enough filter support for the queries these utils actually issue. */
function matches(row: any, filter: any): boolean {
  if (!filter) return true;
  if (Array.isArray(filter._and)) return filter._and.every((f: any) => matches(row, f));
  return Object.entries(filter).every(([field, cond]: [string, any]) => {
    if (field === "_and") return true;
    const v = row[field];
    if (cond?._eq !== undefined) return String(v) === String(cond._eq);
    if (cond?._gte !== undefined) return String(v) >= String(cond._gte);
    return true;
  });
}

beforeEach(() => {
  vi.resetModules();
  nextId = 0;
  missingCollections = new Set();
  rows = {
    hoa_director_briefings: [],
    hoa_director_sessions: [],
    hoa_director_minutes: [],
    ai_actions: [],
  };

  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (desc: Op) => {
      if (missingCollections.has(desc.collection)) {
        throw new Error(`Collection "${desc.collection}" doesn't exist`);
      }
      const all = (rows[desc.collection] ||= []);
      switch (desc.op) {
        case "readOne":
          return all.find((r) => String(r.id) === String(desc.id)) ?? null;
        case "read": {
          let out = all.filter((r) => matches(r, desc.query?.filter));
          const sort: string[] = desc.query?.sort ?? [];
          for (const key of [...sort].reverse()) {
            const desc_ = key.startsWith("-");
            const f = desc_ ? key.slice(1) : key;
            out = [...out].sort((a, b) =>
              desc_
                ? String(b[f] ?? "").localeCompare(String(a[f] ?? ""))
                : String(a[f] ?? "").localeCompare(String(b[f] ?? ""))
            );
          }
          const limit = desc.query?.limit;
          return typeof limit === "number" && limit > 0 ? out.slice(0, limit) : out;
        }
        case "create": {
          const created = {
            id: `row-${++nextId}`,
            // Stamped like Directus does, unless the caller set one explicitly.
            date_created: new Date().toISOString(),
            ...(desc.payload as any),
          };
          all.push(created);
          return created;
        }
        case "updateOne": {
          const row = all.find((r) => String(r.id) === String(desc.id));
          if (row) Object.assign(row, desc.payload);
          return row;
        }
        default:
          return null;
      }
    },
  }));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.NUXT_DIRECTOR_BRIEFING_TTL_HOURS;
  vi.useRealTimers();
});

const briefings = () => import("#core/server/utils/director-briefings");
const sessions = () => import("#core/server/utils/director-sessions");
const minutes = () => import("#core/server/utils/director-minutes");

// ── The cache key ────────────────────────────────────────────────────────────

describe("directorBriefingCacheKey — one derivation, two callers", () => {
  it("finds back exactly what it saved, through the real save and load", async () => {
    const { saveDirectorBriefing, loadLatestDirectorBriefing } = await briefings();
    const scope = {
      scopeType: "org" as const,
      subject: "money",
      topic: "the pool deck assessment",
    };
    await saveDirectorBriefing({
      ...scope,
      organizationId: HOME,
      userId: ME,
      planId: "plan-1",
      intro: "Arrears are aging.",
      points: ["Chase the two oldest"],
      stepCount: 2,
    });

    const found = await loadLatestDirectorBriefing(HOME, scope);
    expect(found?.planId).toBe("plan-1");
    expect(found?.intro).toBe("Arrears are aging.");
    expect(found?.points).toEqual(["Chase the two oldest"]);
    expect(found?.stepCount).toBe(2);
  });

  it("normalises the topic, so trivial typing differences are one section", async () => {
    const { saveDirectorBriefing, loadLatestDirectorBriefing } = await briefings();
    await saveDirectorBriefing({
      scopeType: "org",
      subject: "money",
      topic: "Pool  Deck ",
      organizationId: HOME,
      planId: "plan-1",
    });
    const found = await loadLatestDirectorBriefing(HOME, {
      scopeType: "org",
      subject: "money",
      topic: "pool deck",
    });
    expect(found?.planId).toBe("plan-1");
  });

  it("keeps different subjects, entities and topics apart", async () => {
    const { directorBriefingCacheKey } = await briefings();
    const keys = new Set([
      directorBriefingCacheKey({ scopeType: "org" }),
      directorBriefingCacheKey({ scopeType: "org", subject: "money" }),
      directorBriefingCacheKey({ scopeType: "org", subject: "requests" }),
      directorBriefingCacheKey({ scopeType: "org", subject: "money", topic: "reserves" }),
      directorBriefingCacheKey({ scopeType: "entity", entityType: "request", entityId: "r1" }),
      directorBriefingCacheKey({ scopeType: "entity", entityType: "request", entityId: "r2" }),
      directorBriefingCacheKey({ scopeType: "entity", entityType: "member", entityId: "r1" }),
    ]);
    expect(keys.size).toBe(7);
  });

  it("ignores an entity scope that names no record — it is the org's briefing", async () => {
    const { directorBriefingCacheKey } = await briefings();
    expect(directorBriefingCacheKey({ scopeType: "entity", entityType: "request" })).toBe(
      directorBriefingCacheKey({ scopeType: "org" })
    );
  });

  it("never serves another community's briefing under the same key", async () => {
    const { saveDirectorBriefing, loadLatestDirectorBriefing } = await briefings();
    await saveDirectorBriefing({
      scopeType: "org",
      subject: "money",
      organizationId: OTHER,
      planId: "plan-other",
    });
    const found = await loadLatestDirectorBriefing(HOME, { scopeType: "org", subject: "money" });
    expect(found).toBeNull();
  });

  it("serves the NEWEST briefing when a section has been redrafted", async () => {
    const { saveDirectorBriefing, loadLatestDirectorBriefing } = await briefings();
    const scope = { scopeType: "org" as const, subject: "requests" };
    rows.hoa_director_briefings.push({
      id: "old",
      organization: HOME,
      cache_key: "org::requests::",
      plan_id: "plan-old",
      date_created: new Date(Date.now() - 60_000).toISOString(),
    });
    await saveDirectorBriefing({ ...scope, organizationId: HOME, planId: "plan-new" });
    const found = await loadLatestDirectorBriefing(HOME, scope);
    expect(found?.planId).toBe("plan-new");
  });
});

// ── The TTL ──────────────────────────────────────────────────────────────────

describe("briefing TTL — a stale briefing is worse than no briefing", () => {
  it("defaults to six hours", async () => {
    const { briefingTtlMs } = await briefings();
    expect(briefingTtlMs()).toBe(6 * 60 * 60 * 1000);
  });

  it("takes an override from the environment", async () => {
    process.env.NUXT_DIRECTOR_BRIEFING_TTL_HOURS = "2";
    const { briefingTtlMs } = await briefings();
    expect(briefingTtlMs()).toBe(2 * 60 * 60 * 1000);
  });

  it("ignores a nonsense override rather than caching forever", async () => {
    process.env.NUXT_DIRECTOR_BRIEFING_TTL_HOURS = "not-a-number";
    const { briefingTtlMs } = await briefings();
    expect(briefingTtlMs()).toBe(6 * 60 * 60 * 1000);
  });

  it("serves a briefing five hours old", async () => {
    const { loadLatestDirectorBriefing } = await briefings();
    rows.hoa_director_briefings.push({
      id: "b1",
      organization: HOME,
      cache_key: "org::money::",
      plan_id: "plan-1",
      date_created: new Date(Date.now() - 5 * 3600_000).toISOString(),
    });
    const found = await loadLatestDirectorBriefing(HOME, { scopeType: "org", subject: "money" });
    expect(found?.planId).toBe("plan-1");
  });

  it("refuses one seven hours old, so the caller redraws against today", async () => {
    const { loadLatestDirectorBriefing } = await briefings();
    rows.hoa_director_briefings.push({
      id: "b1",
      organization: HOME,
      cache_key: "org::money::",
      plan_id: "plan-1",
      date_created: new Date(Date.now() - 7 * 3600_000).toISOString(),
    });
    const found = await loadLatestDirectorBriefing(HOME, { scopeType: "org", subject: "money" });
    expect(found).toBeNull();
  });

  it("does not delete the stale row — it is still a record of what was advised", async () => {
    const { loadLatestDirectorBriefing } = await briefings();
    rows.hoa_director_briefings.push({
      id: "b1",
      organization: HOME,
      cache_key: "org::money::",
      plan_id: "plan-1",
      date_created: new Date(Date.now() - 48 * 3600_000).toISOString(),
    });
    await loadLatestDirectorBriefing(HOME, { scopeType: "org", subject: "money" });
    expect(rows.hoa_director_briefings).toHaveLength(1);
  });
});

// ── Not provisioned yet ──────────────────────────────────────────────────────

describe("an unprovisioned store is inert, never broken", () => {
  it("save returns null instead of throwing", async () => {
    missingCollections.add("hoa_director_briefings");
    const { saveDirectorBriefing } = await briefings();
    await expect(
      saveDirectorBriefing({ scopeType: "org", organizationId: HOME, planId: "p" })
    ).resolves.toBeNull();
  });

  it("load returns null, so the planner drafts fresh", async () => {
    missingCollections.add("hoa_director_briefings");
    const { loadLatestDirectorBriefing } = await briefings();
    await expect(loadLatestDirectorBriefing(HOME, { scopeType: "org" })).resolves.toBeNull();
  });

  it("a session cannot be convened, and says so quietly", async () => {
    missingCollections.add("hoa_director_sessions");
    const { createDirectorSession } = await sessions();
    await expect(
      createDirectorSession({ organizationId: HOME, hostId: ME, scopeType: "org" })
    ).resolves.toBeNull();
  });

  it("minutes save to null rather than losing the meeting to a 500", async () => {
    missingCollections.add("hoa_director_minutes");
    const { saveMinutes } = await minutes();
    await expect(
      saveMinutes({ organizationId: HOME, authorId: ME, scopeType: "org" })
    ).resolves.toBeNull();
  });
});

// ── TL;DR splitting ──────────────────────────────────────────────────────────

describe("splitTldr — prose and slide bullets never disagree", () => {
  it("splits the marker line into bullets and keeps the prose", async () => {
    const { splitTldr } = await briefings();
    const { intro, points } = splitTldr(
      "Arrears are aging badly.\nTwo households carry most of it.\n\nTL;DR: Chase the two oldest | Set a reminder | Review at the next meeting"
    );
    expect(intro).toBe("Arrears are aging badly.\nTwo households carry most of it.");
    expect(points).toEqual([
      "Chase the two oldest",
      "Set a reminder",
      "Review at the next meeting",
    ]);
  });

  it("degrades to prose-with-no-bullets when the model ignores the instruction", async () => {
    const { splitTldr } = await briefings();
    const { intro, points } = splitTldr("Everything is quiet this month.");
    expect(intro).toBe("Everything is quiet this month.");
    expect(points).toEqual([]);
  });

  it("uses the LAST marker, so a briefing that mentions the phrase keeps its prose", async () => {
    const { splitTldr } = await briefings();
    const { intro, points } = splitTldr(
      "Nobody reads the TL;DR: line at the top.\nTL;DR: One | Two"
    );
    expect(intro).toBe("Nobody reads the TL;DR: line at the top.");
    expect(points).toEqual(["One", "Two"]);
  });

  it("keeps prose the model wrote after the marker line with the briefing", async () => {
    const { splitTldr } = await briefings();
    const { intro, points } = splitTldr("Body.\nTL;DR: A | B\nOne more thought.");
    expect(points).toEqual(["A", "B"]);
    expect(intro).toBe("Body.\n\nOne more thought.");
  });

  it("strips bullet characters the model adds anyway", async () => {
    const { splitTldr } = await briefings();
    expect(splitTldr("x\nTL;DR: - A | • B | * C").points).toEqual(["A", "B", "C"]);
  });

  it("survives an empty or missing reply", async () => {
    const { splitTldr } = await briefings();
    expect(splitTldr("")).toEqual({ intro: "", points: [] });
    expect(splitTldr(null)).toEqual({ intro: "", points: [] });
  });
});

// ── Sessions: the revision clock ─────────────────────────────────────────────

describe("director sessions — revision is the sync clock", () => {
  it("seats the host and starts at revision zero", async () => {
    const { createDirectorSession, loadSession } = await sessions();
    const id = await createDirectorSession({
      organizationId: HOME,
      hostId: ME,
      hostName: "Dana Ruiz",
      scopeType: "org",
      subject: "money",
    });
    const session = await loadSession(id!, HOME);
    expect(session?.status).toBe("live");
    expect(session?.revision).toBe(0);
    expect(session?.attendees).toEqual([
      expect.objectContaining({ userId: ME, name: "Dana Ruiz", role: "host", status: "active" }),
    ]);
  });

  it("bumps on every recorded decision, and says what happened", async () => {
    const { createDirectorSession, recordActivity, loadSession } = await sessions();
    const id = await createDirectorSession({ organizationId: HOME, hostId: ME, scopeType: "org" });
    await recordActivity(id!, { type: "approve", stepId: "a1", actorName: "Dana" });
    await recordActivity(id!, { type: "reject", stepId: "a2", actorName: "Sam" });
    const session = await loadSession(id!, HOME);
    expect(session?.revision).toBe(2);
    expect(session?.lastActivity).toMatchObject({ type: "reject", stepId: "a2", actorName: "Sam" });
    expect(session?.lastActivity?.at).toBeTruthy();
  });

  it("refuses to hand a session to another community", async () => {
    const { createDirectorSession, loadSession } = await sessions();
    const id = await createDirectorSession({ organizationId: HOME, hostId: ME, scopeType: "org" });
    await expect(loadSession(id!, OTHER)).resolves.toBeNull();
  });

  it("lists only this community's live meetings", async () => {
    const { createDirectorSession, endDirectorSession, listLiveSessions } = await sessions();
    const mine = await createDirectorSession({ organizationId: HOME, hostId: ME, scopeType: "org" });
    const ended = await createDirectorSession({ organizationId: HOME, hostId: ME, scopeType: "org" });
    await createDirectorSession({ organizationId: OTHER, hostId: ME, scopeType: "org" });
    await endDirectorSession(ended!);

    const live = await listLiveSessions(HOME);
    expect(live.map((s) => s.id)).toEqual([mine]);
  });

  it("re-seating someone updates their seat rather than stacking a second one", async () => {
    const { createDirectorSession, upsertAttendee, loadSession } = await sessions();
    const id = await createDirectorSession({ organizationId: HOME, hostId: ME, scopeType: "org" });
    await upsertAttendee(id!, { userId: "u2", name: "Sam", status: "invited" });
    await upsertAttendee(id!, { userId: "u2", name: "Sam", status: "active" });
    const session = await loadSession(id!, HOME);
    expect(session?.attendees).toHaveLength(2);
    expect(session?.attendees.find((a) => a.userId === "u2")?.status).toBe("active");
  });

  it("never demotes the host by re-seating them", async () => {
    const { createDirectorSession, upsertAttendee, loadSession } = await sessions();
    const id = await createDirectorSession({ organizationId: HOME, hostId: ME, scopeType: "org" });
    await upsertAttendee(id!, { userId: ME, role: "member" });
    const session = await loadSession(id!, HOME);
    expect(session?.attendees.find((a) => a.userId === ME)?.role).toBe("host");
  });
});

// ── Sessions: reading a plan's steps back ────────────────────────────────────

describe("loadPlanSteps — plan_id IS ai_actions.session_id", () => {
  const step = (id: string, over: Record<string, any> = {}) => ({
    id,
    organization: HOME,
    session_id: "plan-1",
    action_type: "create_task",
    title: `Step ${id}`,
    preview: JSON.stringify({ kind: "create_task", title: "Order chlorine" }),
    status: "pending",
    outbound: false,
    date_created: `2026-08-2${id.slice(-1)}T00:00:00Z`,
    ...over,
  });

  it("returns the plan's steps, in the order they were proposed", async () => {
    const { loadPlanSteps } = await sessions();
    rows.ai_actions = [step("a1"), step("a2"), step("a3", { session_id: "plan-other" })];
    const steps = await loadPlanSteps("plan-1", HOME);
    expect(steps.map((s) => s.id)).toEqual(["a1", "a2"]);
  });

  it("parses the preview, so a card never renders one character per line", async () => {
    const { loadPlanSteps } = await sessions();
    rows.ai_actions = [step("a1")];
    const [only] = await loadPlanSteps("plan-1", HOME);
    expect(only.preview).toEqual({ kind: "create_task", title: "Order chlorine" });
  });

  it("leaves an unparseable preview alone rather than failing the whole plan", async () => {
    const { loadPlanSteps } = await sessions();
    rows.ai_actions = [step("a1", { preview: "not json at all" })];
    const [only] = await loadPlanSteps("plan-1", HOME);
    expect(only.preview).toBe("not json at all");
  });

  it("cannot surface another community's steps under a guessed plan id", async () => {
    const { loadPlanSteps } = await sessions();
    rows.ai_actions = [step("a1", { organization: OTHER })];
    await expect(loadPlanSteps("plan-1", HOME)).resolves.toEqual([]);
  });

  it("has nothing to read without a plan id, and does not go looking", async () => {
    const { loadPlanSteps } = await sessions();
    rows.ai_actions = [step("a1")];
    await expect(loadPlanSteps(null, HOME)).resolves.toEqual([]);
  });
});

// ── Minutes ──────────────────────────────────────────────────────────────────

describe("director minutes — the durable decision record", () => {
  const steps = [
    { id: "a1", actionType: "create_task", title: "Order chlorine", status: "executed" },
    { id: "a2", actionType: "send_email", title: "Notify residents", status: "rejected" },
    { id: "a3", actionType: "create_task", title: "Book inspection", status: "pending" },
    { id: "a4", actionType: "create_task", title: "Fix gate", status: "failed" },
  ];

  it("rolls the steps up itself, so the counts cannot contradict the list", async () => {
    const { summarizeMinutesSteps } = await minutes();
    expect(summarizeMinutesSteps(steps, 2)).toEqual({
      done: 1,
      skipped: 1,
      failed: 1,
      open: 1,
      total: 4,
      captured: 2,
    });
  });

  it("counts an approved-but-not-yet-run step as still open", async () => {
    const { summarizeMinutesSteps } = await minutes();
    expect(summarizeMinutesSteps([{ id: "x", actionType: "create_task", title: "t", status: "approved" }]).open).toBe(1);
  });

  it("computes stats on save when the caller does not supply them", async () => {
    const { saveMinutes, loadMinutes } = await minutes();
    const id = await saveMinutes({
      organizationId: HOME,
      authorId: ME,
      scopeType: "org",
      subject: "money",
      planId: "plan-1",
      steps,
    });
    const saved = await loadMinutes(id!, HOME);
    expect(saved?.stats).toMatchObject({ done: 1, skipped: 1, failed: 1, open: 1, total: 4 });
    expect(saved?.status).toBe("recorded");
  });

  it("does not hand minutes to another community, and will not share them either", async () => {
    const { saveMinutes, loadMinutes, markMinutesShared } = await minutes();
    const id = await saveMinutes({ organizationId: HOME, authorId: ME, scopeType: "org" });
    await expect(loadMinutes(id!, OTHER)).resolves.toBeNull();
    await expect(markMinutesShared(id!, OTHER)).resolves.toBe(false);
    expect(rows.hoa_director_minutes[0].status).toBe("recorded");
  });

  it("shares minutes that do belong to the caller's community", async () => {
    const { saveMinutes, markMinutesShared, loadMinutes } = await minutes();
    const id = await saveMinutes({ organizationId: HOME, authorId: ME, scopeType: "org" });
    await expect(markMinutesShared(id!, HOME)).resolves.toBe(true);
    expect((await loadMinutes(id!, HOME))?.status).toBe("shared");
  });

  it("lists only this community's records, newest first", async () => {
    const { saveMinutes, listMinutes } = await minutes();
    rows.hoa_director_minutes.push(
      {
        id: "m-old",
        organization: HOME,
        title: "Older",
        status: "recorded",
        date_created: "2026-01-01T00:00:00Z",
      },
      {
        id: "m-foreign",
        organization: OTHER,
        title: "Theirs",
        status: "recorded",
        date_created: "2026-09-01T00:00:00Z",
      }
    );
    await saveMinutes({ organizationId: HOME, authorId: ME, scopeType: "org", title: "Newest" });
    const list = await listMinutes(HOME);
    expect(list.map((m) => m.title)).toEqual(["Newest", "Older"]);
  });
});

/**
 * useBoardroomMinutes — the Board Room's durable half.
 *
 * The one behaviour worth pinning here is a negative: this composable does NOT
 * send the step list. `POST /api/ai/director/minutes` reads the plan's steps
 * back itself and rolls them up, so a decision record's tally cannot have come
 * from the same screen that was displaying it. A future edit that "helpfully"
 * passed `steps` along would move that arithmetic client-side without anything
 * looking broken, which is what this test exists to catch.
 *
 * The rest is fail-soft behaviour: a decision-record strip sits on the meetings
 * hub, and it must never take the hub down with it.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ref } from "vue";

let getCalls: Array<{ url: string; query: any }>;
let postCalls: Array<{ url: string; body: any }>;
let listResponse: any;
let saveResponse: any;
let throwOn: string | null;

const ROW = {
  id: "m1",
  title: "Money",
  subject: "money",
  topic: null,
  scopeType: "org",
  summary: null,
  authorName: "Dana Ruiz",
  status: "recorded",
  stats: { done: 1, skipped: 0, failed: 0, open: 1, total: 2, captured: 0 },
  dateCreated: "2026-08-24T12:00:00Z",
};

beforeEach(() => {
  vi.resetModules();
  getCalls = [];
  postCalls = [];
  throwOn = null;
  listResponse = { minutes: [ROW] };
  saveResponse = { minutesId: "m1", saved: true };

  vi.stubGlobal("$fetch", async (url: string, opts: any = {}) => {
    if (throwOn && url.includes(throwOn)) throw new Error("boom");
    if (opts.method === "POST") {
      postCalls.push({ url, body: opts.body });
      if (url === "/api/ai/director/minutes") return saveResponse;
      return { ok: true, minutes: { ...ROW, status: "shared" } };
    }
    getCalls.push({ url, query: opts.query });
    if (url === "/api/ai/director/minutes") return listResponse;
    return { minutes: { ...ROW, steps: [], points: [] } };
  });
});

const load = async () =>
  (await import("#core/app/composables/useBoardroomMinutes")).useBoardroomMinutes;

describe("useBoardroomMinutes", () => {
  it("does nothing without a community", async () => {
    const useBoardroomMinutes = await load();
    const api = useBoardroomMinutes(ref(""));
    expect(await api.refresh()).toEqual([]);
    expect(await api.record({ planId: "plan-1" })).toBeNull();
    expect(getCalls).toEqual([]);
    expect(postCalls).toEqual([]);
  });

  it("lists this community's records", async () => {
    const useBoardroomMinutes = await load();
    const api = useBoardroomMinutes(ref("org-1"));
    await api.refresh(6);
    expect(getCalls[0]).toMatchObject({
      url: "/api/ai/director/minutes",
      query: { orgId: "org-1", limit: 6 },
    });
    expect(api.list.value).toHaveLength(1);
  });

  it("never sends a step list — the tally is the server's arithmetic", async () => {
    const useBoardroomMinutes = await load();
    const api = useBoardroomMinutes(ref("org-1"));
    await api.record({
      planId: "plan-1",
      title: "Money",
      intro: "A briefing.",
      points: ["One", "Two"],
    });
    const body = postCalls[0]!.body;
    expect(body).toMatchObject({ orgId: "org-1", planId: "plan-1", title: "Money" });
    expect(body).not.toHaveProperty("steps");
    expect(body).not.toHaveProperty("stats");
  });

  it("refreshes the list after recording, so the strip shows what just landed", async () => {
    const useBoardroomMinutes = await load();
    const api = useBoardroomMinutes(ref("org-1"));
    await api.record({ planId: "plan-1" });
    expect(getCalls.map((c) => c.url)).toContain("/api/ai/director/minutes");
  });

  it("says so plainly when the minutes store is not provisioned", async () => {
    saveResponse = { minutesId: null, saved: false };
    const useBoardroomMinutes = await load();
    const api = useBoardroomMinutes(ref("org-1"));
    expect(await api.record({ planId: "plan-1" })).toBeNull();
    expect(api.error.value).toMatch(/not set up/i);
  });

  it("shares a record and reflects the new status", async () => {
    const useBoardroomMinutes = await load();
    const api = useBoardroomMinutes(ref("org-1"));
    const res = await api.share("m1");
    expect(postCalls[0]).toMatchObject({
      url: "/api/ai/director/minutes/m1",
      body: { orgId: "org-1", op: "share" },
    });
    expect(res?.status).toBe("shared");
  });

  it("empties the strip rather than taking the hub down with it", async () => {
    throwOn = "/api/ai/director/minutes";
    const useBoardroomMinutes = await load();
    const api = useBoardroomMinutes(ref("org-1"));
    await expect(api.refresh()).resolves.toEqual([]);
    expect(api.loading.value).toBe(false);
  });

  it("surfaces the server's own message when a save fails", async () => {
    vi.stubGlobal("$fetch", async () => {
      throw { data: { message: "Admin or board access required" } };
    });
    const useBoardroomMinutes = await load();
    const api = useBoardroomMinutes(ref("org-1"));
    expect(await api.record({ planId: "plan-1" })).toBeNull();
    expect(api.error.value).toBe("Admin or board access required");
    expect(api.saving.value).toBe(false);
  });
});

/**
 * Dismissal is the whole reason this composable exists.
 *
 * The server is deterministic: `/api/ai/notices` will return the same notice
 * tomorrow, because the fact behind it is still true. "I have seen this and I
 * am not acting on it today" is therefore a statement about the *reader*, not
 * about the community — which is why it lives in the reader's own browser and
 * not in a shared row. A board member dismissing a stale-project notice must
 * not hide it from the treasurer.
 *
 * Two things then have to hold: the dismissal survives a refresh, and the
 * stored key does not grow forever as entities come and go.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const ORG = "org-home";

let payload: { notices: any[]; total: number; generatedAt: string };
let fetches: Array<{ url: string; opts: any }>;
let fetchError: any = null;

const notice = (id: string, priority = "high") => ({
  id,
  priority,
  type: "warning",
  icon: "lucide:clock",
  title: id,
  description: "",
  score: 70,
});

beforeEach(() => {
  vi.resetModules();
  fetches = [];
  fetchError = null;
  payload = { notices: [], total: 0, generatedAt: "2026-08-24T12:00:00.000Z" };
  window.localStorage.clear();

  vi.stubGlobal("$fetch", async (url: string, opts: any) => {
    fetches.push({ url, opts });
    if (fetchError) throw fetchError;
    return payload;
  });
});

const load = async () => (await import("#core/app/composables/useAINotices")).useAINotices;

const KEY = `hoa.ai-notices.dismissed.${ORG}`;

describe("dismissal", () => {
  it("hides a notice and remembers it in this browser", async () => {
    const useAINotices = await load();
    payload = { notices: [notice("a"), notice("b")], total: 2, generatedAt: "x" };

    const n = useAINotices(ORG);
    await n.refresh();
    expect(n.notices.value.map((x) => x.id)).toEqual(["a", "b"]);

    n.dismiss("a");
    expect(n.notices.value.map((x) => x.id)).toEqual(["b"]);
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual(["a"]);
  });

  it("survives a fresh mount, because the server will send it again", async () => {
    window.localStorage.setItem(KEY, JSON.stringify(["a"]));
    const useAINotices = await load();
    payload = { notices: [notice("a"), notice("b")], total: 2, generatedAt: "x" };

    const n = useAINotices(ORG);
    n.hydrateDismissed();
    await n.refresh();
    expect(n.notices.value.map((x) => x.id)).toEqual(["b"]);
  });

  it("is scoped per community — dismissing here does not hide anything there", async () => {
    const useAINotices = await load();
    payload = { notices: [notice("a")], total: 1, generatedAt: "x" };
    const here = useAINotices(ORG);
    await here.refresh();
    here.dismiss("a");
    expect(window.localStorage.getItem("hoa.ai-notices.dismissed.org-other")).toBeNull();
  });

  it("prunes dismissals for notices that no longer exist", async () => {
    // Otherwise every resolved request leaves its dismissal behind and the key
    // grows without bound.
    window.localStorage.setItem(KEY, JSON.stringify(["gone-1", "gone-2", "a"]));
    const useAINotices = await load();
    payload = { notices: [notice("a")], total: 1, generatedAt: "x" };

    const n = useAINotices(ORG);
    n.hydrateDismissed();
    await n.refresh();
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual(["a"]);
  });

  it("can be undone, one at a time or all at once", async () => {
    const useAINotices = await load();
    payload = { notices: [notice("a"), notice("b")], total: 2, generatedAt: "x" };
    const n = useAINotices(ORG);
    await n.refresh();

    n.dismiss("a");
    n.dismiss("b");
    expect(n.notices.value).toEqual([]);

    n.restore("a");
    expect(n.notices.value.map((x) => x.id)).toEqual(["a"]);

    n.restoreAll();
    expect(n.notices.value.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("does not double-record a repeated dismissal", async () => {
    const useAINotices = await load();
    payload = { notices: [notice("a")], total: 1, generatedAt: "x" };
    const n = useAINotices(ORG);
    await n.refresh();
    n.dismiss("a");
    n.dismiss("a");
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual(["a"]);
  });
});

describe("counts", () => {
  it("badges only what actually wants an answer", async () => {
    const useAINotices = await load();
    payload = {
      notices: [notice("u", "urgent"), notice("h", "high"), notice("m", "medium"), notice("l", "low")],
      total: 4,
      generatedAt: "x",
    };
    const n = useAINotices(ORG);
    await n.refresh();
    expect(n.actionableCount.value).toBe(2);
  });

  it("drops a dismissed notice out of the badge too", async () => {
    const useAINotices = await load();
    payload = { notices: [notice("u", "urgent"), notice("h", "high")], total: 2, generatedAt: "x" };
    const n = useAINotices(ORG);
    await n.refresh();
    n.dismiss("u");
    expect(n.actionableCount.value).toBe(1);
  });
});

describe("fetching", () => {
  it("asks for nothing without a community", async () => {
    const useAINotices = await load();
    const n = useAINotices(null);
    await n.refresh();
    expect(fetches).toEqual([]);
  });

  it("treats a 403 as 'no feed', not as an error to show", async () => {
    // A member without board standing is refused, correctly. That is not a
    // failure worth putting a red banner in front of them for.
    const useAINotices = await load();
    fetchError = Object.assign(new Error("Forbidden"), { statusCode: 403 });
    const n = useAINotices(ORG);
    await n.refresh();
    expect(n.error.value).toBeNull();
    expect(n.notices.value).toEqual([]);
  });

  it("surfaces a real failure", async () => {
    const useAINotices = await load();
    fetchError = Object.assign(new Error("boom"), { statusCode: 500 });
    const n = useAINotices(ORG);
    await n.refresh();
    expect(n.error.value).toBeTruthy();
  });

  it("passes an entity focus through to the endpoint", async () => {
    const useAINotices = await load();
    const n = useAINotices(ORG);
    await n.refresh({ entityType: "request", entityId: "r1" });
    expect(fetches[0].opts.query).toEqual({ orgId: ORG, entityType: "request", entityId: "r1" });
  });
});

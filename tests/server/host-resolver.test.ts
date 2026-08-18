// The Host → org resolver's cache: it must cut Directus round-trips without
// serving a stale answer past its TTL, must not let an attacker-supplied Host
// grow memory without bound, and must collapse a concurrent burst into one query.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let directusRequest: ReturnType<typeof vi.fn>;

// Nitro auto-import resolved as a global at module-eval time.
vi.stubGlobal("getTypedDirectus", () => ({ request: (...a: unknown[]) => directusRequest(...a) }));

const { resolveOrgForHost, invalidateHostCache, hostCacheSize, fetchOrgByHost } = await import(
  "#core/server/utils/host-resolver"
);

const row = (id: string, slug: string, domain: string) => ({
  id,
  slug,
  name: slug,
  custom_domain: domain,
});

beforeEach(() => {
  vi.useFakeTimers();
  invalidateHostCache();
  directusRequest = vi.fn(async () => [row("org-1", "605-lincoln", "605lincolnroad.com")]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("resolveOrgForHost", () => {
  it("resolves a verified custom domain", async () => {
    const org = await resolveOrgForHost("605lincolnroad.com");
    expect(org).toEqual({ id: "org-1", slug: "605-lincoln", name: "605-lincoln" });
  });

  it("serves repeat lookups from cache instead of Directus", async () => {
    await resolveOrgForHost("605lincolnroad.com");
    await resolveOrgForHost("605lincolnroad.com");
    await resolveOrgForHost("605LincolnRoad.com:443");
    expect(directusRequest).toHaveBeenCalledTimes(1);
  });

  it("re-queries once the positive TTL expires", async () => {
    await resolveOrgForHost("605lincolnroad.com");
    vi.advanceTimersByTime(61_000);
    await resolveOrgForHost("605lincolnroad.com");
    expect(directusRequest).toHaveBeenCalledTimes(2);
  });

  it("caches a miss, but only briefly, so a freshly verified domain goes live fast", async () => {
    directusRequest = vi.fn(async () => []);
    expect(await resolveOrgForHost("newdomain.com")).toBeNull();
    expect(await resolveOrgForHost("newdomain.com")).toBeNull();
    expect(directusRequest).toHaveBeenCalledTimes(1);

    // Still cached at 10s (under the 15s negative TTL)...
    vi.advanceTimersByTime(10_000);
    await resolveOrgForHost("newdomain.com");
    expect(directusRequest).toHaveBeenCalledTimes(1);

    // ...and re-checked well before the 60s positive TTL would have elapsed.
    vi.advanceTimersByTime(6_000);
    await resolveOrgForHost("newdomain.com");
    expect(directusRequest).toHaveBeenCalledTimes(2);
  });

  it("collapses a concurrent burst into a single query", async () => {
    const all = await Promise.all([
      resolveOrgForHost("605lincolnroad.com"),
      resolveOrgForHost("605lincolnroad.com"),
      resolveOrgForHost("605lincolnroad.com"),
    ]);
    expect(directusRequest).toHaveBeenCalledTimes(1);
    expect(all.every((o) => o?.id === "org-1")).toBe(true);
  });

  it("returns null for an empty host without touching Directus", async () => {
    expect(await resolveOrgForHost("")).toBeNull();
    expect(await resolveOrgForHost(undefined)).toBeNull();
    expect(directusRequest).not.toHaveBeenCalled();
  });

  it("does not cache a Directus outage, so recovery is immediate", async () => {
    directusRequest = vi.fn(async () => {
      throw new Error("directus down");
    });
    expect(await resolveOrgForHost("605lincolnroad.com")).toBeNull();
    expect(hostCacheSize()).toBe(0);

    directusRequest = vi.fn(async () => [row("org-1", "605-lincoln", "605lincolnroad.com")]);
    expect((await resolveOrgForHost("605lincolnroad.com"))?.id).toBe("org-1");
  });

  it("prefers an exact host match over another org's www variant", async () => {
    directusRequest = vi.fn(async () => [
      row("org-www", "other", "www.example.com"),
      row("org-bare", "mine", "example.com"),
    ]);
    expect((await resolveOrgForHost("example.com"))?.id).toBe("org-bare");
  });
});

describe("invalidateHostCache", () => {
  it("drops the entry so the next call re-queries", async () => {
    await resolveOrgForHost("605lincolnroad.com");
    invalidateHostCache("605lincolnroad.com");
    await resolveOrgForHost("605lincolnroad.com");
    expect(directusRequest).toHaveBeenCalledTimes(2);
  });

  it("drops the www twin as well as the bare form", async () => {
    await resolveOrgForHost("www.605lincolnroad.com");
    invalidateHostCache("605lincolnroad.com");
    await resolveOrgForHost("www.605lincolnroad.com");
    expect(directusRequest).toHaveBeenCalledTimes(2);
  });

  it("accepts a messy stored value (protocol, case, port)", async () => {
    await resolveOrgForHost("605lincolnroad.com");
    invalidateHostCache("HTTPS://605LincolnRoad.com:443/");
    await resolveOrgForHost("605lincolnroad.com");
    expect(directusRequest).toHaveBeenCalledTimes(2);
  });
});

describe("cache bounds", () => {
  it("caps entries so unmatched (attacker-supplied) hosts cannot grow memory", async () => {
    directusRequest = vi.fn(async () => []);
    for (let i = 0; i < 600; i++) await resolveOrgForHost(`spoof-${i}.example.com`);
    expect(hostCacheSize()).toBeLessThanOrEqual(500);
  });
});

describe("fetchOrgByHost", () => {
  it("is uncached — every call hits Directus", async () => {
    await fetchOrgByHost("605lincolnroad.com");
    await fetchOrgByHost("605lincolnroad.com");
    expect(directusRequest).toHaveBeenCalledTimes(2);
    expect(hostCacheSize()).toBe(0);
  });
});

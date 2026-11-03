// @vitest-environment node
/**
 * useDirectusItems — server-render auth.
 *
 * During SSR the global $fetch calls a Nitro route in-process without the
 * incoming request's cookies. /api/directus/items then sees no session, uses
 * the public Directus client, and Directus refuses hoa_members — so a hard load
 * of /{slug}/admin/* rendered a signed-in admin as a visitor and 302'd them to
 * the org root, and the login page's "Try the demo" button landed on the public
 * landing. Client-side navigation hid it: the browser sends the cookie itself.
 *
 * The contract pinned here:
 *   · a server-side call goes through the page request's fetch, carrying its
 *     cookie, and is answered as the user;
 *   · that fetch is captured at setup, because callers await before they read
 *     (useSelectedOrg reads inside useAsyncData) and the Nuxt context is gone
 *     by then;
 *   · a session cookie re-sealed by a token refresh inside that call reaches
 *     the page response — Directus refresh tokens are single-use, so dropping
 *     it would leave the browser holding a dead one;
 *   · the browser keeps using plain $fetch.
 *
 * The Nuxt seam is stubbed the way Nuxt/Nitro implement it: useRequestFetch()
 * is `useRequestEvent()?.$fetch || globalThis.$fetch`, and event.$fetch is the
 * in-process fetch with the page request's headers merged in.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ref, computed } from "vue";

const COOKIE = "nuxt-session=sealed-admin-session";
const MEMBERS = [{ id: "m1", organization: { slug: "demo" }, role: "hoa-admin" }];

type Call = { url: string; opts: any; cookie: string | undefined };
let routeCalls: Call[];
let refreshOnNextCall: string | null;
let loggedIn: ReturnType<typeof ref<boolean>>;
let nuxtContext: boolean;
let pageSetCookie: ReturnType<typeof ref<string | string[] | undefined>>;
let useResponseHeaderCalls: number;

/**
 * The in-process route, shaped like core/server/api/directus/items.post.ts:
 * no session cookie → public client → Directus FORBIDDEN on hoa_members.
 * Runs ofetch's onResponse hook the way ofetch would.
 */
async function itemsRoute(url: string, opts: any, cookie: string | undefined) {
  routeCalls.push({ url, opts, cookie });
  const headers = new Headers();
  if (cookie && refreshOnNextCall) {
    headers.append("set-cookie", refreshOnNextCall);
    refreshOnNextCall = null;
  }
  const response = new Response(null, { status: cookie ? 200 : 403, headers });
  await opts?.onResponse?.({ response });
  if (!cookie) throw Object.assign(new Error("FORBIDDEN"), { statusCode: 403 });
  return MEMBERS;
}

/** Global $fetch: server-side it is in-process and forwards nothing. */
const globalFetch = vi.fn((url: string, opts?: any) => itemsRoute(url, opts, undefined));

/** The page request's event, as Nitro builds it. */
const pageEvent = {
  headers: { cookie: COOKIE },
  $fetch: vi.fn((url: string, opts?: any) => itemsRoute(url, opts, pageEvent.headers.cookie)),
};

function onServer() {
  vi.stubGlobal("useRequestEvent", () => {
    if (!nuxtContext) throw new Error("[nuxt] instance unavailable");
    return pageEvent;
  });
  vi.stubGlobal("useRequestFetch", () => {
    if (!nuxtContext) throw new Error("[nuxt] instance unavailable");
    return pageEvent.$fetch;
  });
  vi.stubGlobal("useResponseHeader", (name: string) => {
    if (!nuxtContext) throw new Error("[nuxt] instance unavailable");
    expect(name).toBe("set-cookie");
    useResponseHeaderCalls++;
    return pageSetCookie;
  });
}

function inBrowser() {
  vi.stubGlobal("useRequestEvent", () => undefined);
  vi.stubGlobal("useRequestFetch", () => globalFetch);
  vi.stubGlobal("useResponseHeader", () => {
    useResponseHeaderCalls++;
    return ref();
  });
}

async function load() {
  const mod = await import("#core/app/composables/useDirectusItems");
  return mod.useDirectusItems;
}

beforeEach(() => {
  vi.resetModules();
  routeCalls = [];
  refreshOnNextCall = null;
  loggedIn = ref(true);
  nuxtContext = true;
  pageSetCookie = ref<string | string[] | undefined>(undefined);
  useResponseHeaderCalls = 0;
  globalFetch.mockClear();
  pageEvent.$fetch.mockClear();
  vi.stubGlobal("$fetch", globalFetch);
  vi.stubGlobal("useUserSession", () => ({ loggedIn: computed(() => loggedIn.value) }));
});

describe("useDirectusItems on the server", () => {
  beforeEach(onServer);

  it("reads through the page request's fetch, carrying its cookie", async () => {
    const useDirectusItems = await load();
    const result = await useDirectusItems("hoa_members").list({ filter: { user: { _eq: "u1" } } });

    expect(result).toEqual(MEMBERS);
    expect(globalFetch).not.toHaveBeenCalled();
    expect(routeCalls).toHaveLength(1);
    expect(routeCalls[0].cookie).toBe(COOKIE);
    expect(routeCalls[0].url).toBe("/api/directus/items");
    expect(routeCalls[0].opts).toMatchObject({
      method: "POST",
      body: { collection: "hoa_members", operation: "list", query: { filter: { user: { _eq: "u1" } } } },
    });
  });

  it("captures the request fetch at setup, so a read after the caller's await still carries the cookie", async () => {
    const useDirectusItems = await load();
    const members = useDirectusItems("hoa_members");

    // useSelectedOrg reads inside useAsyncData, after awaits: no Nuxt context.
    nuxtContext = false;

    await expect(members.list()).resolves.toEqual(MEMBERS);
    await expect(members.get("m1")).resolves.toEqual(MEMBERS);
    await expect(members.count()).resolves.toBe(0);
    expect(routeCalls.map((c) => c.cookie)).toEqual([COOKIE, COOKIE, COOKIE]);
    expect(routeCalls.map((c) => c.opts.body.operation)).toEqual(["list", "get", "aggregate"]);
  });

  it("forwards writes the same way", async () => {
    const useDirectusItems = await load();
    const members = useDirectusItems("hoa_members");

    await members.create({ id: "m2" } as any);
    await members.update("m2", { role: "x" } as any);
    await members.remove("m2");

    expect(globalFetch).not.toHaveBeenCalled();
    expect(routeCalls.map((c) => [c.opts.body.operation, c.cookie])).toEqual([
      ["create", COOKIE],
      ["update", COOKIE],
      ["delete", COOKIE],
    ]);
  });

  it("relays a session cookie re-sealed by a token refresh to the page response", async () => {
    const useDirectusItems = await load();
    const members = useDirectusItems("hoa_members");
    pageSetCookie.value = "other=1; Path=/";
    refreshOnNextCall = "nuxt-session=rotated; Path=/; HttpOnly";

    nuxtContext = false;
    await members.list();
    await members.list(); // no refresh this time: nothing more to relay

    expect(pageSetCookie.value).toEqual(["other=1; Path=/", "nuxt-session=rotated; Path=/; HttpOnly"]);
  });

  it("relays nothing for a logged-out (public) read", async () => {
    loggedIn.value = false;
    const useDirectusItems = await load();
    refreshOnNextCall = "nuxt-session=fresh-anonymous; Path=/";

    await useDirectusItems("hoa_landing", { requireAuth: false }).list();

    expect(pageSetCookie.value).toBeUndefined();
  });
});

describe("useDirectusItems in the browser", () => {
  beforeEach(inBrowser);

  it("uses plain $fetch and never touches response headers", async () => {
    const useDirectusItems = await load();
    // In the browser, the browser sends the cookie; model that on the stub.
    globalFetch.mockImplementationOnce((url: string, opts?: any) => itemsRoute(url, opts, COOKIE));

    await expect(useDirectusItems("hoa_members").list()).resolves.toEqual(MEMBERS);

    expect(globalFetch).toHaveBeenCalledTimes(1);
    expect(pageEvent.$fetch).not.toHaveBeenCalled();
    expect(useResponseHeaderCalls).toBe(0);
  });
});

/**
 * `requireCronOrAppAdmin` guards every cron-shaped route — the scheduled-email
 * sweep, the AI notices check, the demo reset, the member-count recompute.
 * Each of those touches EVERY organization, so the manual fallback has to be
 * an App Administrator, not "anyone with a session": until 2026-10 all four
 * accepted any logged-in member, which meant a resident of one community
 * could fire the demo reset or re-run the notices sweep for every other one.
 *
 * The matrix pinned here: both secret spellings pass; no session is 401; an
 * HOA admin or ordinary member is 403 (a refusal that names what is missing);
 * the app admin passes; and an unset secret can never be matched by an empty
 * header.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cronSecretMatches, requireCronOrAppAdmin } from "#core/server/utils/cron-auth";

const APP_ADMIN_ROLE = "role-app-admin";
const HOA_ADMIN_ROLE = "role-hoa-admin";

type FakeEvent = { headers: Record<string, string> };
let session: { user?: { id?: string; role?: string | { id?: string } } } | null;

function event(headers: Record<string, string> = {}): FakeEvent {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return { headers: lower };
}

beforeEach(() => {
  session = null;
  process.env.CRON_SECRET = "s3cret";
  vi.stubGlobal("getHeader", (e: FakeEvent, name: string) => e.headers[name.toLowerCase()]);
  vi.stubGlobal("getUserSession", async () => session);
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { directusRoleAppAdmin: APP_ADMIN_ROLE } }));
});

// No `vi.unstubAllGlobals()` here: it would also strip the `createError`
// stub that tests/setup.ts installs, and a bare `throw createError(...)` then
// becomes a ReferenceError with no statusCode. The beforeEach above re-stubs
// everything this file touches.
afterEach(() => {
  delete process.env.CRON_SECRET;
});

async function refusal(e: FakeEvent): Promise<number | undefined> {
  try {
    await requireCronOrAppAdmin(e as any);
    return undefined;
  } catch (err) {
    return (err as { statusCode?: number }).statusCode;
  }
}

describe("cronSecretMatches", () => {
  it("accepts the x-cron-secret header and the Vercel bearer form", () => {
    expect(cronSecretMatches(event({ "x-cron-secret": "s3cret" }) as any)).toBe(true);
    expect(cronSecretMatches(event({ authorization: "Bearer s3cret" }) as any)).toBe(true);
  });

  it("refuses a wrong or missing secret, and never matches when none is configured", () => {
    expect(cronSecretMatches(event({ "x-cron-secret": "nope" }) as any)).toBe(false);
    expect(cronSecretMatches(event() as any)).toBe(false);
    delete process.env.CRON_SECRET;
    expect(cronSecretMatches(event({ "x-cron-secret": "" }) as any)).toBe(false);
    expect(cronSecretMatches(event({ authorization: "Bearer " }) as any)).toBe(false);
  });
});

describe("requireCronOrAppAdmin", () => {
  it("passes on the secret without consulting the session", async () => {
    const getUserSession = vi.fn(async () => session);
    vi.stubGlobal("getUserSession", getUserSession);
    await expect(requireCronOrAppAdmin(event({ "x-cron-secret": "s3cret" }) as any)).resolves.toBe("cron");
    expect(getUserSession).not.toHaveBeenCalled();
  });

  it("is 401 with no session", async () => {
    expect(await refusal(event())).toBe(401);
  });

  it("is 403 for an HOA admin or an ordinary member — a session is not standing", async () => {
    session = { user: { id: "u1", role: HOA_ADMIN_ROLE } };
    expect(await refusal(event())).toBe(403);
    session = { user: { id: "u2", role: { id: "role-member" } } };
    expect(await refusal(event())).toBe(403);
    session = { user: { id: "u3" } };
    expect(await refusal(event())).toBe(403);
  });

  it("passes an App Administrator, whether the role is a string or an object", async () => {
    session = { user: { id: "u1", role: APP_ADMIN_ROLE } };
    await expect(requireCronOrAppAdmin(event() as any)).resolves.toBe("app-admin");
    session = { user: { id: "u1", role: { id: APP_ADMIN_ROLE } } };
    await expect(requireCronOrAppAdmin(event() as any)).resolves.toBe("app-admin");
  });

  it("a wrong secret falls through to the session check rather than passing", async () => {
    session = { user: { id: "u1", role: HOA_ADMIN_ROLE } };
    expect(await refusal(event({ "x-cron-secret": "wrong" }))).toBe(403);
  });
});

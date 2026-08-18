// Security tests for the Stripe Connect endpoints: the client-supplied
// organizationId grants nothing — the server must verify the session user is
// an admin of THAT org (requireAdminAccess) before any Stripe or Directus
// write. Regression guard for the pre-activation gap flagged in ROADMAP
// Phase 1 ("connect/account.post.ts trusts a client-supplied organizationId").
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";

const { accountsCreate, accountLinksCreate } = vi.hoisted(() => ({
  accountsCreate: vi.fn(),
  accountLinksCreate: vi.fn(),
}));

vi.mock("stripe", () => {
  class StripeError extends Error {}
  function MockStripe(this: any) {
    this.accounts = { create: accountsCreate };
    this.accountLinks = { create: accountLinksCreate };
  }
  (MockStripe as any).errors = { StripeError };
  return { default: MockStripe };
});

// Nitro auto-imports resolved as globals at module-eval time.
vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);

const accountHandler = (
  await import("#core/server/api/stripe/connect/account.post")
).default as (event: H3Event) => Promise<any>;
const accountLinkHandler = (
  await import("#core/server/api/stripe/connect/account-link.post")
).default as (event: H3Event) => Promise<any>;

const ORG = "11111111-1111-4111-8111-111111111111";
const event = {} as H3Event;

let body: Record<string, unknown>;
let requireAdmin: ReturnType<typeof vi.fn>;
let directusRequest: ReturnType<typeof vi.fn>;

const forbidden = () =>
  Object.assign(new Error("Admin access required for this operation"), {
    statusCode: 403,
  });

beforeEach(() => {
  vi.clearAllMocks();
  body = { organizationId: ORG };
  requireAdmin = vi.fn(async () => ({ isAdmin: true }));
  directusRequest = vi.fn(async () => ({ id: ORG, name: "Test Org" }));

  vi.stubGlobal("useRuntimeConfig", () => ({
    stripeSecretKeyTest: "sk_test_x",
    stripeSecretKeyLive: "",
    public: { appUrl: "https://app.example.com" },
  }));
  vi.stubGlobal("isStripeLiveMode", () => false);
  vi.stubGlobal("STRIPE_API_VERSION", "2024-06-20");
  vi.stubGlobal("readBody", async () => body);
  vi.stubGlobal("requireAdminAccess", requireAdmin);
  vi.stubGlobal("getTypedDirectus", () => ({ request: directusRequest }));
  // readItem/updateItem are Nitro auto-imports (re-exported from
  // server/utils/directus.ts); the stubbed request() ignores the command.
  vi.stubGlobal("readItem", (...args: unknown[]) => ({ cmd: "readItem", args }));
  vi.stubGlobal("updateItem", (...args: unknown[]) => ({ cmd: "updateItem", args }));
});

describe("POST /api/stripe/connect/account", () => {
  it("rejects a non-admin with 403 before touching Stripe or Directus", async () => {
    requireAdmin.mockRejectedValue(forbidden());

    await expect(accountHandler(event)).rejects.toMatchObject({ statusCode: 403 });
    expect(requireAdmin).toHaveBeenCalledWith(event, ORG);
    expect(accountsCreate).not.toHaveBeenCalled();
    expect(directusRequest).not.toHaveBeenCalled();
  });

  it("gates on the org from the body — the id itself grants nothing", async () => {
    requireAdmin.mockRejectedValue(forbidden());
    body = { organizationId: "22222222-2222-4222-8222-222222222222" };

    await expect(accountHandler(event)).rejects.toMatchObject({ statusCode: 403 });
    expect(requireAdmin).toHaveBeenCalledWith(
      event,
      "22222222-2222-4222-8222-222222222222"
    );
  });

  it("is idempotent for an admin when the org already has an account", async () => {
    directusRequest.mockResolvedValue({
      id: ORG,
      name: "Test Org",
      stripe_connect_account_id: "acct_existing",
    });

    const res = await accountHandler(event);
    expect(res).toEqual({ accountId: "acct_existing", created: false });
    expect(accountsCreate).not.toHaveBeenCalled();
  });

  it("creates + persists an Express account for an admin of the org", async () => {
    accountsCreate.mockResolvedValue({
      id: "acct_new",
      charges_enabled: false,
      payouts_enabled: false,
    });

    const res = await accountHandler(event);
    expect(res).toEqual({ accountId: "acct_new", created: true });
    expect(requireAdmin).toHaveBeenCalledWith(event, ORG);
    // read org + persist account id/state
    expect(directusRequest).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/stripe/connect/account-link", () => {
  it("rejects a non-admin with 403 before reading the org or minting a link", async () => {
    requireAdmin.mockRejectedValue(forbidden());

    await expect(accountLinkHandler(event)).rejects.toMatchObject({ statusCode: 403 });
    expect(directusRequest).not.toHaveBeenCalled();
    expect(accountLinksCreate).not.toHaveBeenCalled();
  });

  it("mints an onboarding link for an admin of an org with a Connect account", async () => {
    directusRequest.mockResolvedValue({
      id: ORG,
      stripe_connect_account_id: "acct_existing",
    });
    accountLinksCreate.mockResolvedValue({ url: "https://connect.stripe.com/x" });

    const res = await accountLinkHandler(event);
    expect(res).toEqual({ url: "https://connect.stripe.com/x" });
    expect(accountLinksCreate).toHaveBeenCalledWith(
      expect.objectContaining({ account: "acct_existing", type: "account_onboarding" })
    );
  });
});

import { describe, it, expect, afterEach, vi } from "vitest";
import { getStripeWebhookSecrets, isStripeLiveMode } from "#core/server/utils/stripe";

// isStripeLiveMode decides which Stripe key pair + webhook secret the app uses.
// STRIPE_MODE is an explicit override so the prod instance can run in test mode.
const orig = { mode: process.env.STRIPE_MODE, node: process.env.NODE_ENV };
afterEach(() => {
  if (orig.mode === undefined) delete process.env.STRIPE_MODE;
  else process.env.STRIPE_MODE = orig.mode;
  process.env.NODE_ENV = orig.node;
});

describe("isStripeLiveMode", () => {
  it("STRIPE_MODE=test wins even when NODE_ENV=production", () => {
    process.env.NODE_ENV = "production";
    process.env.STRIPE_MODE = "test";
    expect(isStripeLiveMode()).toBe(false);
  });

  it("STRIPE_MODE=live wins even when NODE_ENV=development", () => {
    process.env.NODE_ENV = "development";
    process.env.STRIPE_MODE = "live";
    expect(isStripeLiveMode()).toBe(true);
  });

  it("is case-insensitive", () => {
    process.env.NODE_ENV = "production";
    process.env.STRIPE_MODE = "TEST";
    expect(isStripeLiveMode()).toBe(false);
  });

  it("falls back to NODE_ENV when STRIPE_MODE is unset", () => {
    delete process.env.STRIPE_MODE;
    process.env.NODE_ENV = "production";
    expect(isStripeLiveMode()).toBe(true);
    process.env.NODE_ENV = "development";
    expect(isStripeLiveMode()).toBe(false);
  });

  it("an unrecognized STRIPE_MODE falls back to NODE_ENV", () => {
    process.env.STRIPE_MODE = "sandbox";
    process.env.NODE_ENV = "production";
    expect(isStripeLiveMode()).toBe(true);
  });
});

// The webhook route accepts the account endpoint's secret and the Connect
// endpoint's secret: Stripe keeps those event scopes on separate endpoints.
describe("getStripeWebhookSecrets", () => {
  const ALL = {
    stripeWebhookSecret: "whsec_base",
    stripeWebhookSecretTest: "whsec_test",
    stripeWebhookSecretLive: "whsec_live",
    stripeWebhookSecretConnectTest: "whsec_connect_test",
    stripeWebhookSecretConnectLive: "whsec_connect_live",
  };
  const withConfig = (config: Record<string, string | undefined>) => vi.stubGlobal("useRuntimeConfig", () => config);

  it("live mode: the live account secret, then the live Connect secret", () => {
    process.env.STRIPE_MODE = "live";
    withConfig(ALL);
    expect(getStripeWebhookSecrets()).toEqual(["whsec_live", "whsec_connect_live"]);
  });

  it("test mode: the test pair, never a live secret", () => {
    process.env.STRIPE_MODE = "test";
    withConfig(ALL);
    expect(getStripeWebhookSecrets()).toEqual(["whsec_test", "whsec_connect_test"]);
  });

  it("without a Connect secret, only the account secret (falling back to the base one)", () => {
    process.env.STRIPE_MODE = "live";
    withConfig({ stripeWebhookSecret: "whsec_base", stripeWebhookSecretConnectLive: "" });
    expect(getStripeWebhookSecrets()).toEqual(["whsec_base"]);
  });

  it("lists a secret once when both are the same", () => {
    process.env.STRIPE_MODE = "live";
    withConfig({ stripeWebhookSecretLive: "whsec_same", stripeWebhookSecretConnectLive: "whsec_same" });
    expect(getStripeWebhookSecrets()).toEqual(["whsec_same"]);
  });

  it("is empty when nothing is configured", () => {
    process.env.STRIPE_MODE = "live";
    withConfig({});
    expect(getStripeWebhookSecrets()).toEqual([]);
  });
});

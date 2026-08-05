import { describe, it, expect, afterEach } from "vitest";
import { isStripeLiveMode } from "#core/server/utils/stripe";

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

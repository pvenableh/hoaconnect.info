/**
 * POST /api/email/activity (the SendGrid Event Webhook) takes only signed posts
 * in production.
 *
 * Until 2026-11-12, with SENDGRID_WEBHOOK_PUBLIC_KEY unset — as it is on
 * production (docs/gtm-checklist.md §4) — an unsigned post was accepted, and
 * one can mark any community's members bounced or opted out. A production build
 * with no key now answers 503 before reading anything, so SendGrid retries until
 * the key is set; a wrong signature is 403; only a local/test server still
 * accepts unsigned posts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { H3Event } from "h3";

const h = vi.hoisted(() => ({ key: "" as string | undefined, reads: 0, verified: false }));

vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);
const handler = (await import("#core/server/api/email/activity.post")).default as (e: H3Event) => Promise<any>;

beforeEach(() => {
  h.key = undefined;
  h.reads = 0;
  h.verified = false;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("readRawBody", async () => "[]");
  vi.stubGlobal("getHeader", () => null);
  vi.stubGlobal("useRuntimeConfig", () => ({ sendgridWebhookPublicKey: h.key }));
  vi.stubGlobal("verifySendgridEventWebhook", () => h.verified);
  vi.stubGlobal("SENDGRID_SIGNATURE_HEADER", "x-twilio-email-event-webhook-signature");
  vi.stubGlobal("SENDGRID_TIMESTAMP_HEADER", "x-twilio-email-event-webhook-timestamp");
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async () => {
      h.reads++;
      return [];
    },
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/email/activity signing", () => {
  it("refuses everything with 503 in production when no key is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(handler({} as H3Event)).rejects.toMatchObject({ statusCode: 503 });
    expect(h.reads).toBe(0);
  });

  it("refuses a bad signature with 403 once the key is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    h.key = "MFkw…";
    await expect(handler({} as H3Event)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("accepts a good signature in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    h.key = "MFkw…";
    h.verified = true;
    expect(await handler({} as H3Event)).toMatchObject({ success: true });
  });

  it("still accepts an unsigned post on a local or test server", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(await handler({} as H3Event)).toMatchObject({ success: true });
  });
});

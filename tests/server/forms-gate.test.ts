/** requireFormsPlan: the 402 the sign and create routes throw, per plan state. */
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ org: {} as any }));
vi.mock("@directus/sdk", () => ({ readItem: (c: string, id: string) => ({ c, id }) }));
vi.stubGlobal("getTypedDirectus", () => ({ request: async () => h.org }));
vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.statusMessage), o));

const { requireFormsPlan, getFormsGate } = await import("#core/server/utils/forms-gate");

beforeEach(() => (h.org = {}));

describe("forms to sign server gate", () => {
  it("passes a Mid plan", async () => {
    h.org = { subscription_status: "active", subscription_plan: { slug: "mid" } };
    await expect(requireFormsPlan("o1")).resolves.toBeUndefined();
  });
  it("402s Boutique with the upgrade sentence", async () => {
    h.org = { subscription_status: "active", subscription_plan: { slug: "boutique" } };
    await expect(requireFormsPlan("o1")).rejects.toMatchObject({ statusCode: 402, data: { code: "forms_plan", reason: "plan" } });
  });
  it("402s an expired subscription and a missing plan", async () => {
    h.org = { subscription_status: "expired", subscription_plan: { slug: "grand" } };
    await expect(requireFormsPlan("o1")).rejects.toMatchObject({ statusCode: 402, data: { reason: "subscription" } });
    h.org = { subscription_status: "active", subscription_plan: null };
    await expect(requireFormsPlan("o1")).rejects.toMatchObject({ statusCode: 402, data: { reason: "no_plan" } });
  });
  it("passes a comped account", async () => {
    h.org = { is_free_account: true };
    expect((await getFormsGate("o1")).allowed).toBe(true);
  });
});

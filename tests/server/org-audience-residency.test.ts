/**
 * `orgAudienceUserIds` decides who an owners-only or tenants-only notice, a
 * meeting bell and a reminder reach. Residency lives on the unit link now, with
 * `hoa_members.member_type` only as the fallback, so the audience is resolved
 * with `residencyFor()` rather than filtered on the member field in Directus.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItem: (collection: string, id: string, query: unknown) => ({ op: "readOne", collection, id, query }),
  readItems: (collection: string, query: unknown) => ({ op: "read", collection, query }),
  readNotifications: (query: unknown) => ({ op: "readNotifications", collection: "directus_notifications", query }),
}));

const ORG = "org-1";
let reads: Array<{ collection: string; query: any }>;

const MEMBERS = [
  // Linked as a tenant, but the old member field still says owner.
  { user: "u-moved-in-tenant", member_type: "owner", units: [{ member_type: "tenant", is_primary_unit: true, end_date: null }] },
  // No link yet: the member field decides.
  { user: "u-unlinked-owner", member_type: "owner", units: [] },
  // Their tenancy ended; the member field (owner) is what is left.
  { user: "u-ended-tenant", member_type: "owner", units: [{ member_type: "tenant", is_primary_unit: true, end_date: "2020-01-01" }] },
  { user: "u-tenant", member_type: "tenant", units: [] },
];

beforeEach(() => {
  vi.resetModules();
  reads = [];
  vi.stubGlobal("useRuntimeConfig", () => ({ public: {} }));
  vi.stubGlobal("getTypedDirectus", () => ({
    request: async (desc: { collection: string; query: any }) => {
      reads.push(desc);
      return desc.collection === "hoa_members" ? MEMBERS : [];
    },
  }));
});

async function audience(tag: string) {
  const { orgAudienceUserIds } = await import("#core/server/utils/notification-events");
  return orgAudienceUserIds(ORG, tag);
}

describe("orgAudienceUserIds resolves owners and tenants from the unit link", () => {
  it("owners: unlinked owners and ended tenancies, not a current tenant link", async () => {
    expect((await audience("owners")).sort()).toEqual(["u-ended-tenant", "u-unlinked-owner"]);
  });

  it("tenants: the current tenant link wins over the member field", async () => {
    expect((await audience("tenants")).sort()).toEqual(["u-moved-in-tenant", "u-tenant"]);
  });

  it("reads active members of the org with the link fields, not a member_type filter", async () => {
    await audience("owners");
    const read = reads.find((r) => r.collection === "hoa_members")!;
    expect(read.query.filter).toEqual({ organization: { _eq: ORG }, status: { _eq: "active" } });
    expect(read.query.fields).toEqual(["user", "member_type", "units.member_type", "units.is_primary_unit", "units.end_date"]);
  });

  it("all: everyone, and no link fields asked for", async () => {
    expect(await audience("all")).toHaveLength(4);
    expect(reads.find((r) => r.collection === "hoa_members")!.query.fields).toEqual(["user"]);
  });
});

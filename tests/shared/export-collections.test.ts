import { describe, it, expect } from "vitest";
import {
  EXPORT_MAP,
  EXPORT_TIERS,
  PLATFORM_COLLECTIONS,
  entriesForTier,
  entryFor,
  exportOrder,
  keepsRow,
  orderEntries,
  rowFilterFor,
  unmappedCollections,
  type ExportEntry,
} from "#core/shared/export/collections";
import { visibleTiersFor } from "#core/shared/ledger/visibility";
import { CollectionNames } from "#core/types/directus";

const ALL_COLLECTIONS = Object.values(CollectionNames) as string[];

describe("the export map covers the schema", () => {
  it("leaves no collection undecided", () => {
    // The guard this map exists for: a collection added to the schema without a
    // decision would otherwise vanish from every export, silently.
    expect(unmappedCollections(ALL_COLLECTIONS)).toEqual([]);
  });

  it("never both maps and excludes the same collection", () => {
    const both = EXPORT_MAP.filter((e) => e.collection in PLATFORM_COLLECTIONS);
    expect(both.map((e) => e.collection)).toEqual([]);
  });

  it("maps only collections that exist in the schema", () => {
    const unknown = EXPORT_MAP.map((e) => e.collection).filter(
      (c) => !ALL_COLLECTIONS.includes(c)
    );
    expect(unknown).toEqual([]);
  });

  it("excludes only collections that exist in the schema", () => {
    const unknown = Object.keys(PLATFORM_COLLECTIONS).filter(
      (c) => !ALL_COLLECTIONS.includes(c)
    );
    expect(unknown).toEqual([]);
  });

  it("gives every exclusion a stated reason", () => {
    for (const [name, reason] of Object.entries(PLATFORM_COLLECTIONS)) {
      expect(reason.length, `${name} needs a reason`).toBeGreaterThan(20);
    }
  });

  it("has no duplicate entries", () => {
    const names = EXPORT_MAP.map((e) => e.collection);
    expect(names.length).toBe(new Set(names).size);
  });
});

describe("scoping", () => {
  it("scopes the organization row by primary key, not by an FK", () => {
    expect(entryFor("hoa_organizations")?.scope).toEqual({ kind: "self" });
  });

  it("scopes junctions and children through a parent", () => {
    expect(entryFor("hoa_channel_messages")?.scope).toEqual({
      kind: "via",
      parent: "hoa_channels",
      field: "channel",
    });
    expect(entryFor("hoa_member_units")?.scope).toEqual({
      kind: "via",
      parent: "hoa_members",
      field: "member_id",
    });
  });

  it("resolves every via-parent inside the same tier", () => {
    // A child whose parent is missing from the tier cannot be scoped at all —
    // the worker would have no ids to filter by.
    for (const tier of EXPORT_TIERS) {
      const present = new Set(entriesForTier(tier).map((e) => e.collection));
      for (const entry of entriesForTier(tier)) {
        if (entry.scope.kind !== "via") continue;
        expect(
          present.has(entry.scope.parent),
          `${entry.collection} needs ${entry.scope.parent} in the "${tier}" tier`
        ).toBe(true);
      }
    }
  });
});

describe("exportOrder", () => {
  it("puts every via-parent before its children, in both tiers", () => {
    for (const tier of EXPORT_TIERS) {
      const seen = new Set<string>();
      for (const entry of exportOrder(tier)) {
        if (entry.scope.kind === "via") {
          expect(
            seen.has(entry.scope.parent),
            `${entry.collection} came before ${entry.scope.parent}`
          ).toBe(true);
        }
        seen.add(entry.collection);
      }
    }
  });

  it("returns every entry in the tier exactly once", () => {
    for (const tier of EXPORT_TIERS) {
      const ordered = exportOrder(tier);
      expect(ordered.length).toBe(entriesForTier(tier).length);
      expect(new Set(ordered.map((e) => e.collection)).size).toBe(ordered.length);
    }
  });

  it("throws rather than emit a partial order when a parent is missing", () => {
    const orphan: ExportEntry = {
      collection: "child",
      label: "Child",
      scope: { kind: "via", parent: "absent_parent", field: "parent" },
      tiers: ["full"],
    };
    expect(() => orderEntries([orphan])).toThrow(/child/);
  });

  it("throws on a cycle", () => {
    const a: ExportEntry = {
      collection: "a",
      label: "A",
      scope: { kind: "via", parent: "b", field: "b" },
      tiers: ["full"],
    };
    const b: ExportEntry = {
      collection: "b",
      label: "B",
      scope: { kind: "via", parent: "a", field: "a" },
      tiers: ["full"],
    };
    expect(() => orderEntries([a, b])).toThrow(/a, b/);
  });
});

describe("tiers", () => {
  it("puts everything in the full tier", () => {
    expect(entriesForTier("full").length).toBe(EXPORT_MAP.length);
  });

  it("withholds board deliberation from the shareable tier", () => {
    const shareable = new Set(entriesForTier("shareable").map((e) => e.collection));
    for (const withheld of [
      "hoa_channels",
      "hoa_channel_messages",
      "hoa_channel_moderation_log",
      "hoa_comments",
      "hoa_comment_reports",
      "hoa_activity",
      "ai_conversations",
      "ai_messages",
      "ai_transactions",
    ]) {
      expect(shareable.has(withheld), `${withheld} should not be shareable`).toBe(false);
    }
  });

  it("keeps the operational record — including delinquency — in the shareable tier", () => {
    // Deliberate: a successor manager cannot do the job without knowing who
    // owes what, so this is NOT treated as private board material.
    const shareable = new Set(entriesForTier("shareable").map((e) => e.collection));
    for (const kept of [
      "hoa_organizations",
      "hoa_members",
      "hoa_units",
      "hoa_leases",
      "hoa_requests",
      "hoa_governance",
      "hoa_meetings",
      "hoa_documents",
      "payment_requests",
      "payment_transactions",
      "payment_expenses",
    ]) {
      expect(shareable.has(kept), `${kept} should be shareable`).toBe(true);
    }
  });

  it("redacts only in service of the shareable tier", () => {
    // Every declared redaction belongs to an entry that is actually shareable —
    // a redaction on a full-only entry would never run.
    for (const entry of EXPORT_MAP) {
      if (!entry.redact?.length) continue;
      expect(entry.tiers).toContain("shareable");
    }
  });

  it("carries the community's ledger into BOTH tiers, owner-visible rows only", () => {
    // The whole point of the row filter. A handover that omitted the community's
    // own record would hand a successor the data and none of the history that
    // explains it — but a board-tier entry names one household's standing, and
    // a shareable archive is a copy a community can give to anyone.
    const entry = entryFor("org_audit_log")!;
    expect(entry.tiers).toEqual(["full", "shareable"]);

    const filter = rowFilterFor(entry, "shareable")!;
    expect(filter.field).toBe("visibility");
    expect([...filter.keep]).toEqual(["owners"]);
    expect(filter.note).toBeTruthy();

    // The full tier is verbatim by definition — never filtered.
    expect(rowFilterFor(entry, "full")).toBeNull();
  });

  it("takes the shareable tiers from the ledger's policy module, not a literal", () => {
    // If who-may-see-what changes, the export changes in the same commit.
    const entry = entryFor("org_audit_log")!;
    const asOwner = visibleTiersFor({
      isMember: true,
      isBoard: false,
      isManager: false,
      isAdmin: false,
    });
    expect([...rowFilterFor(entry, "shareable")!.keep]).toEqual([...asOwner]);
  });

  it("keeps an owner-visible row and drops a board one, failing closed on both edges", () => {
    const entry = entryFor("org_audit_log")!;
    expect(keepsRow(entry, "shareable", { visibility: "owners" })).toBe(true);
    expect(keepsRow(entry, "shareable", { visibility: "board" })).toBe(false);

    // A row with no visibility at all is the one whose audience is unknown —
    // withheld, in the same direction the ledger's own reader fails.
    expect(keepsRow(entry, "shareable", {})).toBe(false);
    expect(keepsRow(entry, "shareable", { visibility: null })).toBe(false);
    expect(keepsRow(entry, "shareable", { visibility: "everyone" })).toBe(false);

    // The board's own copy is verbatim.
    expect(keepsRow(entry, "full", { visibility: "board" })).toBe(true);
  });

  it("filters no other collection by row, so an unfiltered entry stays unfiltered", () => {
    for (const entry of EXPORT_MAP) {
      if (entry.collection === "org_audit_log") continue;
      expect(rowFilterFor(entry, "shareable"), `${entry.collection}`).toBeNull();
      expect(keepsRow(entry, "shareable", { anything: "at all" })).toBe(true);
    }
  });

  it("declares a row filter only on entries that reach the shareable tier", () => {
    // A filter on a full-only entry would never run — the same trap the
    // redaction test guards.
    for (const entry of EXPORT_MAP) {
      if (!entry.shareableRows) continue;
      expect(entry.tiers).toContain("shareable");
    }
  });

  it("never exports push subscriptions in any tier", () => {
    // Live push credentials. Worth its own test so a future edit has to be
    // deliberate.
    expect(entryFor("push_subscriptions")).toBeUndefined();
    expect(PLATFORM_COLLECTIONS.push_subscriptions).toBeDefined();
  });
});

describe("human CSVs", () => {
  it("covers the four the roadmap promises", () => {
    // Ledger is derived from payment_* rather than being one collection, so it
    // is built by the worker; the other three are straight projections.
    const withCsv = EXPORT_MAP.filter((e) => e.csv).map((e) => e.collection);
    expect(withCsv).toEqual(["hoa_members", "hoa_units", "hoa_requests"]);
  });

  it("gives each CSV a distinct filename and non-empty columns", () => {
    const files = new Set<string>();
    for (const entry of EXPORT_MAP) {
      if (!entry.csv) continue;
      expect(entry.csv.columns.length).toBeGreaterThan(0);
      expect(files.has(entry.csv.file)).toBe(false);
      files.add(entry.csv.file);
    }
  });

  it("only puts CSVs on collections that reach the shareable tier", () => {
    for (const entry of EXPORT_MAP) {
      if (entry.csv) expect(entry.tiers).toContain("shareable");
    }
  });
});

import { describe, it, expect } from "vitest";
import { csvCell, toCsv, readPath, rowsToCsv } from "#core/shared/export/csv";
import { redactRow, redactRows, redactedFields } from "#core/shared/export/redaction";
import {
  buildManifest,
  renderReadme,
  totalRows,
  EXPORT_SCHEMA_VERSION,
} from "#core/shared/export/manifest";
import { entryFor, PLATFORM_COLLECTIONS } from "#core/shared/export/collections";
import type { ExportEntry } from "#core/shared/export/collections";
import type { ManifestCollection } from "#core/shared/export/manifest";

describe("csvCell", () => {
  it("leaves plain values alone", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(42)).toBe("42");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("Smith, Jr")).toBe('"Smith, Jr"');
    expect(csvCell('She said "hi"')).toBe('"She said ""hi"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
  });

  it("renders null and undefined as empty", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });
});

describe("readPath", () => {
  const row = {
    name: "A101",
    balance: 250.5,
    active: true,
    mailing_address: { line1: "1 Main St", city: "Miami" },
    unit: { name: "A101" },
    member: "b7f2-id-only",
    missing: null,
  };

  it("reads a top-level field", () => {
    expect(readPath(row, "name")).toBe("A101");
    expect(readPath(row, "balance")).toBe(250.5);
  });

  it("reads through an expanded relation", () => {
    expect(readPath(row, "unit.name")).toBe("A101");
  });

  it("yields empty when a relation came back as a bare id", () => {
    // Directus returns either an object or the id string depending on `fields`;
    // an un-expanded relation should blank the cell, not throw.
    expect(readPath(row, "member.first_name")).toBe("");
  });

  it("yields empty for missing paths and nulls", () => {
    expect(readPath(row, "nope")).toBe("");
    expect(readPath(row, "missing")).toBe("");
    expect(readPath(row, "nope.deeper")).toBe("");
    expect(readPath(null, "anything")).toBe("");
  });

  it("stringifies a JSON column rather than dropping it", () => {
    expect(readPath(row, "mailing_address")).toBe(
      '{"line1":"1 Main St","city":"Miami"}'
    );
  });

  it("renders booleans readably", () => {
    expect(readPath(row, "active")).toBe("true");
  });
});

describe("toCsv / rowsToCsv", () => {
  it("writes a header row then data rows", () => {
    expect(toCsv(["Month", "Net"], [["2026-01", 200], ["2026-02", -50]])).toBe(
      "Month,Net\n2026-01,200\n2026-02,-50"
    );
  });

  it("writes just the header for no rows", () => {
    expect(toCsv(["A", "B"], [])).toBe("A,B");
  });

  it("projects rows through a column spec", () => {
    const csv = rowsToCsv(
      [
        { header: "Unit", path: "unit.name" },
        { header: "Title", path: "title" },
      ],
      [{ unit: { name: "A101" }, title: "Leak, kitchen" }]
    );
    expect(csv).toBe('Unit,Title\nA101,"Leak, kitchen"');
  });
});

describe("redaction", () => {
  const entry = entryFor("hoa_members") as ExportEntry;

  it("redacts nothing in the full tier", () => {
    expect(redactedFields(entry, "full")).toEqual([]);
    const row = { first_name: "Ada", manager_permissions: { documents: true } };
    expect(redactRow(entry, "full", row)).toEqual(row);
  });

  it("nulls the declared fields in the shareable tier", () => {
    const out = redactRow(entry, "shareable", {
      first_name: "Ada",
      manager_permissions: { documents: true },
    });
    expect(out.manager_permissions).toBeNull();
    expect(out.first_name).toBe("Ada");
  });

  it("keeps the key present so a reader can tell withheld from empty", () => {
    const out = redactRow(entry, "shareable", { manager_permissions: { a: 1 } });
    expect("manager_permissions" in out).toBe(true);
  });

  it("does not invent a column the row never had", () => {
    const out = redactRow(entry, "shareable", { first_name: "Ada" });
    expect("manager_permissions" in out).toBe(false);
  });

  it("does not mutate the input row", () => {
    const row = { manager_permissions: { a: 1 } };
    redactRow(entry, "shareable", row);
    expect(row.manager_permissions).toEqual({ a: 1 });
  });

  it("leaves rows untouched for an entry with no redactions", () => {
    const plain = entryFor("hoa_units") as ExportEntry;
    const rows = [{ name: "A101" }, { name: "A102" }];
    expect(redactRows(plain, "shareable", rows)).toEqual(rows);
  });

  it("redacts the org's platform billing identifiers when sharing", () => {
    const org = entryFor("hoa_organizations") as ExportEntry;
    const out = redactRow(org, "shareable", {
      name: "605 Lincoln",
      stripe_connect_account_id: "acct_123",
      stripe_customer_id: "cus_123",
    });
    expect(out.stripe_connect_account_id).toBeNull();
    expect(out.stripe_customer_id).toBeNull();
    expect(out.name).toBe("605 Lincoln");
  });
});

describe("manifest", () => {
  const collections: ManifestCollection[] = [
    { collection: "hoa_members", label: "Members", file: "data/hoa_members.json", rows: 42 },
    {
      collection: "hoa_units",
      label: "Units",
      file: "data/hoa_units.json",
      rows: 20,
      redacted: ["manager_permissions"],
    },
  ];

  const base = {
    tier: "full" as const,
    generatedAt: "2026-08-19T17:00:00.000Z",
    organization: { id: "org-1", name: "605 Lincoln", slug: "605-lincoln" },
    collections,
    csvs: ["csv/members.csv"],
    files: { count: 118, bytes: 5_242_880 },
  };

  it("stamps the schema version", () => {
    expect(buildManifest(base).schema_version).toBe(EXPORT_SCHEMA_VERSION);
    expect(EXPORT_SCHEMA_VERSION).toBe(1);
  });

  it("always records why the platform collections are absent", () => {
    const m = buildManifest(base);
    expect(m.excluded.push_subscriptions).toBe(PLATFORM_COLLECTIONS.push_subscriptions);
  });

  it("merges tier-specific omissions over the platform ones", () => {
    const m = buildManifest({
      ...base,
      tier: "shareable",
      excludedByTier: { hoa_channel_messages: "Board deliberation." },
    });
    expect(m.excluded.hoa_channel_messages).toBe("Board deliberation.");
    expect(m.excluded.billing_accounts).toBeDefined();
  });

  it("defaults the build id to null rather than omitting it", () => {
    expect(buildManifest(base).app_build_id).toBeNull();
  });

  it("sums rows across collections", () => {
    expect(totalRows(buildManifest(base))).toBe(62);
  });
});

describe("renderReadme", () => {
  const manifest = buildManifest({
    tier: "full",
    generatedAt: "2026-08-19T17:00:00.000Z",
    organization: { id: "org-1", name: "605 Lincoln", slug: "605-lincoln" },
    collections: [
      { collection: "hoa_members", label: "Members", file: "data/hoa_members.json", rows: 42 },
    ],
    csvs: ["csv/members.csv"],
    files: { count: 118, bytes: 5_242_880 },
  });

  it("names the community and the generation time", () => {
    const text = renderReadme(manifest);
    expect(text).toContain("605 Lincoln");
    expect(text).toContain("2026-08-19T17:00:00.000Z");
  });

  it("states the ownership promise in plain language", () => {
    expect(renderReadme(manifest)).toContain("belongs to your community");
  });

  it("reports the files archive in human units", () => {
    expect(renderReadme(manifest)).toContain("5.0 MB");
    expect(renderReadme(manifest)).toContain("118");
  });

  it("says so when files were left out", () => {
    const without = buildManifest({
      tier: "full",
      generatedAt: "2026-08-19T17:00:00.000Z",
      organization: { id: "org-1", name: "605 Lincoln", slug: "605-lincoln" },
      collections: [],
      csvs: [],
      files: null,
    });
    const text = renderReadme(without);
    expect(text).toContain("not included");
    expect(text).not.toContain("Every document, photo");
  });

  it("explains the shareable tier only in a shareable archive", () => {
    expect(renderReadme(manifest)).not.toContain("ABOUT THIS SHAREABLE EXPORT");
    const shareable = buildManifest({
      tier: "shareable",
      generatedAt: "2026-08-19T17:00:00.000Z",
      organization: { id: "org-1", name: "605 Lincoln", slug: "605-lincoln" },
      collections: [],
      csvs: [],
      files: null,
    });
    const text = renderReadme(shareable);
    expect(text).toContain("ABOUT THIS SHAREABLE EXPORT");
    expect(text).toContain("private deliberation");
  });

  it("lists what was left out and why", () => {
    const text = renderReadme(manifest);
    expect(text).toContain("NOT INCLUDED, AND WHY");
    expect(text).toContain("push_subscriptions");
  });

  it("falls back to the slug when the org has no name", () => {
    const anon = buildManifest({
      tier: "full",
      generatedAt: "2026-08-19T17:00:00.000Z",
      organization: { id: "org-1", name: null, slug: "605-lincoln" },
      collections: [],
      csvs: [],
      files: null,
    });
    expect(renderReadme(anon)).toContain("605-lincoln");
  });
});

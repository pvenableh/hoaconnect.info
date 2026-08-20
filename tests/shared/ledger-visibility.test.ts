/**
 * The Community Ledger's policy layer: who may see an entry, and what an entry
 * says.
 *
 * The visibility assertions are the point of this file. VISION's first named
 * risk to the whole product is a delinquency-shaming incident — one member's
 * standing shown to another — and the defence is that the answer to "may this
 * person see this row?" is computed in exactly one place. A regression here is
 * not a broken screen; it is the thing that kills the brand.
 *
 * The fail-closed cases matter as much as the happy ones. Rows outlive the code
 * that wrote them: an append-only table WILL eventually be read by a client
 * older than the row it is holding, and the safe direction is to withhold.
 */

import { describe, it, expect } from "vitest";
import {
  LEDGER_SCHEMA_VERSION,
  LEDGER_VISIBILITIES,
  type LedgerEntry,
} from "#core/shared/ledger/entry";
import {
  LEDGER_CATEGORIES,
  LEDGER_EVENTS,
  categoryFor,
  defaultVisibilityFor,
  descriptorFor,
  eventTypesInCategory,
} from "#core/shared/ledger/events";
import {
  NO_ACCESS,
  canView,
  canViewLedger,
  filterVisible,
  normalizeVisibility,
  visibilityFilter,
  visibleTiersFor,
  type LedgerViewer,
} from "#core/shared/ledger/visibility";
import {
  buildDocumentPublishedEntry,
  buildGrantChangeEntry,
  buildPollClosedEntry,
  diffGrants,
  isNoOpGrantChange,
  isPublishTransition,
  pollLeaders,
} from "#core/shared/ledger/entries";
import {
  formatDate,
  formatDateTime,
  groupByMonth,
  humanizeKey,
  payloadRows,
} from "#core/shared/ledger/format";
import { MANAGER_GRANT_KEYS, NO_GRANTS } from "#core/shared/transition/grants";
import { buildTransitionAuditEntry } from "#core/shared/transition/audit";

const admin: LedgerViewer = { isMember: true, isBoard: false, isManager: false, isAdmin: true };
const board: LedgerViewer = { isMember: true, isBoard: true, isManager: false, isAdmin: false };
const manager: LedgerViewer = { isMember: true, isBoard: false, isManager: true, isAdmin: false };
const owner: LedgerViewer = { isMember: true, isBoard: false, isManager: false, isAdmin: false };

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: "org-1",
    event_type: "document_published",
    occurred_at: "2026-08-20T16:07:33.311Z",
    actor_user: "user-1",
    actor_name: "Dana Reyes",
    actor_email: "dana@example.com",
    visibility: "owners",
    summary: "A document was published.",
    payload: {},
    ...over,
  };
}

describe("visibility tiers", () => {
  it("gives the board tier to admins, board officers and managers", () => {
    for (const viewer of [admin, board, manager]) {
      expect(visibleTiersFor(viewer)).toEqual(["owners", "board"]);
    }
  });

  it("gives a plain member only owner-visible entries", () => {
    expect(visibleTiersFor(owner)).toEqual(["owners"]);
  });

  it("gives someone with no seat in the community nothing at all", () => {
    expect(visibleTiersFor(NO_ACCESS)).toEqual([]);
    expect(canViewLedger(NO_ACCESS)).toBe(false);
  });

  it("does not require isMember alongside a hat that already implies one", () => {
    // checkAdminAccess, the board lookup and the manager lookup each resolve
    // through an active membership row, so a route that only resolved one of
    // them still gets the right answer.
    const adminOnly: LedgerViewer = { ...NO_ACCESS, isAdmin: true };
    expect(visibleTiersFor(adminOnly)).toEqual(["owners", "board"]);
  });
});

describe("normalizeVisibility fails closed", () => {
  it("keeps the tiers it knows", () => {
    for (const tier of LEDGER_VISIBILITIES) expect(normalizeVisibility(tier)).toBe(tier);
  });

  it.each([null, undefined, "", "public", "everyone", 7, {}])(
    "treats %p as board-only",
    (value) => {
      expect(normalizeVisibility(value)).toBe("board");
    }
  );

  it("withholds a row whose tier this build has never heard of", () => {
    const future = entry({ visibility: "world" as any });
    expect(canView(future, owner)).toBe(false);
    expect(canView(future, admin)).toBe(true);
  });
});

describe("canView and filterVisible agree with the tiers", () => {
  const rows = [
    entry({ summary: "owners row", visibility: "owners" }),
    entry({ summary: "board row", visibility: "board" }),
    entry({ summary: "broken row", visibility: null as any }),
  ];

  it("shows a member only the owner-visible row", () => {
    const visible = filterVisible(rows, owner);
    expect(visible.map((r) => r.summary)).toEqual(["owners row"]);
    expect(rows.filter((r) => canView(r, owner))).toEqual(visible);
  });

  it("shows the board everything, including a row with a broken tier", () => {
    expect(filterVisible(rows, board)).toHaveLength(3);
  });

  it("shows a stranger nothing", () => {
    expect(filterVisible(rows, NO_ACCESS)).toEqual([]);
  });

  it("preserves order", () => {
    const many = [
      entry({ summary: "1", visibility: "owners" }),
      entry({ summary: "2", visibility: "board" }),
      entry({ summary: "3", visibility: "owners" }),
    ];
    expect(filterVisible(many, owner).map((r) => r.summary)).toEqual(["1", "3"]);
  });
});

describe("visibilityFilter narrows the query rather than the page", () => {
  it("produces a Directus _in fragment for a member", () => {
    expect(visibilityFilter(owner)).toEqual({ visibility: { _in: ["owners"] } });
  });

  it("produces both tiers for the board", () => {
    expect(visibilityFilter(admin)).toEqual({ visibility: { _in: ["owners", "board"] } });
  });

  it("returns null for someone with no access, so the route can close the door", () => {
    expect(visibilityFilter(NO_ACCESS)).toBeNull();
  });

  it("matches what canView would decide for every tier", () => {
    for (const viewer of [admin, board, manager, owner, NO_ACCESS]) {
      const filter = visibilityFilter(viewer);
      const allowed = filter ? filter.visibility._in : [];
      for (const tier of LEDGER_VISIBILITIES) {
        expect(canView(entry({ visibility: tier }), viewer)).toBe(allowed.includes(tier));
      }
    }
  });
});

describe("the event catalogue", () => {
  it("has a unique key, a label and a real category for every event", () => {
    const keys = LEDGER_EVENTS.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const e of LEDGER_EVENTS) {
      expect(e.label.trim()).not.toBe("");
      expect(e.note.trim()).not.toBe("");
      expect(LEDGER_CATEGORIES.map((c) => c.key)).toContain(e.category);
      expect(LEDGER_VISIBILITIES).toContain(e.defaultVisibility);
    }
  });

  it("keeps a payment board-only — it names one household", () => {
    // The one default that must not be relaxed casually. See VISION's risks.
    expect(defaultVisibilityFor("payment_recorded")).toBe("board");
    expect(canView(entry({ visibility: "board" }), owner)).toBe(false);
  });

  it("keeps the things owners are promised owner-visible", () => {
    for (const key of [
      "management_transition",
      "manager_grants_changed",
      "expense_recorded",
      "document_published",
      "poll_closed",
      "ai_action_executed",
    ]) {
      expect(defaultVisibilityFor(key)).toBe("owners");
    }
  });

  it("renders an event type from a newer deploy generically, and withholds it", () => {
    const d = descriptorFor("assessment_levied");
    expect(d.label).toBe("Assessment levied");
    expect(d.key).toBe("assessment_levied");
    expect(d.defaultVisibility).toBe("board");
    expect(categoryFor("assessment_levied")).toBe("records");
  });

  it("never returns undefined, even for junk", () => {
    for (const value of [null, undefined, ""]) {
      expect(descriptorFor(value).label).toBeTruthy();
    }
  });

  it("maps a category back to its event types", () => {
    expect(eventTypesInCategory("access")).toContain("manager_grants_changed");
    expect(eventTypesInCategory("money")).toContain("payment_recorded");
    expect(eventTypesInCategory("management")).toEqual(["management_transition"]);
  });
});

describe("the transition entry still reads from the catalogue", () => {
  it("is owner-visible without hardcoding the string", () => {
    const built = buildTransitionAuditEntry({
      plan: {
        successor: { id: "m1", name: "Nina Alvarez", email: "nina@example.com", hasGrants: false } as any,
        outgoing: [{ id: "m2", name: "Dana Reyes", email: "dana@example.com", hasGrants: true } as any],
        graceEndsAt: "2026-10-19T00:00:00.000Z",
        steps: [],
        warnings: [],
        blockers: [],
      } as any,
      organizationId: "org-1",
      organizationName: "Transition Test HOA",
      actor: { userId: "u1", name: "Demo", email: "demo@example.com" },
      occurredAt: "2026-08-20T16:07:33.311Z",
    });
    expect(built.visibility).toBe(defaultVisibilityFor("management_transition"));
    expect(built.schema_version).toBe(LEDGER_SCHEMA_VERSION);
    expect(canView(built, owner)).toBe(true);
  });
});

describe("grant-change entries", () => {
  const subject = { memberId: "m-7", name: "Dana Reyes", email: "dana@example.com" };
  const actor = { userId: "u-1", name: "Peter Hoffman", email: "peter@example.com" };
  const at = "2026-08-20T18:00:00.000Z";

  const build = (before: Record<string, boolean>, after: Record<string, boolean>, presetKey?: string) =>
    buildGrantChangeEntry({
      organizationId: "org-1",
      organizationName: "Transition Test HOA",
      manager: subject,
      before,
      after,
      actor,
      occurredAt: at,
      presetKey: presetKey ?? null,
    });

  it("diffs against a normalized shape, so a missing key is not a removal", () => {
    // hoa_members.manager_permissions has a stale Directus default that predates
    // `projects` and `activity`; rows really do come back short of keys.
    const stale = { inquiries: true, violations: false, directory: false, documents: false, communications: false };
    const diff = diffGrants(stale, { ...stale, projects: true });
    expect(diff.added).toEqual(["projects"]);
    expect(diff.removed).toEqual([]);
  });

  it("returns null when nothing moved, so the ledger stays worth reading", () => {
    expect(build({ inquiries: true }, { inquiries: true })).toBeNull();
    expect(isNoOpGrantChange(diffGrants(null, null))).toBe(true);
  });

  it("names the permissions in a sentence a board can read", () => {
    const built = build({ inquiries: true }, { inquiries: true, projects: true, communications: true });
    expect(built?.summary).toBe("Dana Reyes gained Communications and Projects.");
  });

  it("says both halves when permissions move in both directions", () => {
    const built = build({ inquiries: true, projects: true }, { inquiries: false, projects: true, documents: true });
    expect(built?.summary).toBe("Dana Reyes gained Documents and lost Inquiries.");
  });

  it("says plainly when a manager is left with nothing", () => {
    const built = build({ inquiries: true, projects: true }, { ...NO_GRANTS });
    expect(built?.summary).toBe("Dana Reyes's management permissions were all removed.");
  });

  it("records the resulting arrangement so a reader need not replay history", () => {
    const built = build({}, { inquiries: true, documents: true });
    expect(built?.payload.resulting_permissions).toEqual(["Inquiries", "Documents"]);
    expect(built?.payload.added).toEqual(["Inquiries", "Documents"]);
    expect(built?.payload.removed).toEqual([]);
    expect((built?.payload.manager as any).member_id).toBe("m-7");
  });

  it("names the preset when the change was a preset", () => {
    const all = Object.fromEntries(MANAGER_GRANT_KEYS.map((k) => [k, true]));
    const built = build({}, all, "full_service");
    expect(built?.payload.preset).toBe("Full service");
    expect(built?.payload.preset_applied).toBe("full_service");
  });

  it("is owner-visible, from the catalogue", () => {
    const built = build({}, { projects: true });
    expect(built?.visibility).toBe("owners");
    expect(built?.event_type).toBe("manager_grants_changed");
    expect(built?.occurred_at).toBe(at);
    expect(built?.actor_name).toBe("Peter Hoffman");
  });

  it("falls back to the email when a manager row has no name", () => {
    const built = buildGrantChangeEntry({
      organizationId: "org-1",
      organizationName: null,
      manager: { memberId: "m-8", name: "", email: "nobody@example.com" },
      before: {},
      after: { projects: true },
      actor,
      occurredAt: at,
    });
    expect(built?.summary).toBe("nobody@example.com gained Projects.");
  });
});

describe("document-published entries", () => {
  const actor = { userId: "u-1", name: "Peter Hoffman", email: "peter@example.com" };
  const at = "2026-08-21T15:00:00.000Z";

  const build = (previousStatus: string | null, over: Record<string, any> = {}) => {
    const { document: documentOver, ...rest } = over;
    return buildDocumentPublishedEntry({
      organizationId: "org-1",
      organizationName: "Transition Test HOA",
      document: {
        documentId: "doc-9",
        title: "Reserve Study 2026",
        categoryName: "Financials",
        fileName: "reserve-study-2026.pdf",
        ...(documentOver ?? {}),
      },
      previousStatus,
      actor,
      occurredAt: at,
      ...rest,
    });
  };

  it("records the publish, naming the document and where it landed", () => {
    const built = build("draft");
    expect(built?.summary).toBe(
      "Reserve Study 2026 was published to the document library under Financials."
    );
    expect(built?.event_type).toBe("document_published");
    expect(built?.occurred_at).toBe(at);
  });

  it("is owner-visible, from the catalogue", () => {
    // What governs a community is the community's to read. If this ever comes
    // back board-only, the catalogue changed and the change was not deliberate.
    expect(build("draft")?.visibility).toBe("owners");
    expect(defaultVisibilityFor("document_published")).toBe("owners");
  });

  it("writes nothing for a draft save, however many times it happens", () => {
    expect(build("draft", { nextStatus: "draft" })).toBeNull();
    expect(build(null, { nextStatus: "draft" })).toBeNull();
    expect(isPublishTransition("draft", "draft")).toBe(false);
  });

  it("writes nothing when the document was already published", () => {
    // Re-saving a published document changes metadata; the library did not gain
    // anything, and a ledger of retitles is a ledger nobody scrolls.
    expect(build("published")).toBeNull();
    expect(isPublishTransition("published", "published")).toBe(false);
  });

  it("treats a return from the archive as a publish, and says so", () => {
    expect(isPublishTransition("archived", "published")).toBe(true);
    expect(build("archived")?.summary).toBe(
      "Reserve Study 2026 was restored to the document library under Financials."
    );
  });

  it("drops the category clause rather than naming an empty one", () => {
    const built = build("draft", { document: { categoryName: null } });
    expect(built?.summary).toBe("Reserve Study 2026 was published to the document library.");
    expect(built?.payload.category).toBeNull();
  });

  it("falls back to the file name when a document has no title", () => {
    const built = build("draft", { document: { title: "  " } });
    expect(built?.summary).toBe(
      "reserve-study-2026.pdf was published to the document library under Financials."
    );
  });

  it("keeps enough to identify the artefact after the row is gone", () => {
    // The point of denormalizing: the source row can be renamed, recategorized,
    // or deleted, and this entry still says which document was published.
    const built = build("draft");
    expect(built?.payload).toMatchObject({
      document_id: "doc-9",
      title: "Reserve Study 2026",
      category: "Financials",
      file_name: "reserve-study-2026.pdf",
      previous_status: "draft",
      organization_name: "Transition Test HOA",
    });
  });
});

describe("poll-closed entries", () => {
  const actor = { userId: "u-1", name: "Peter Hoffman", email: "peter@example.com" };
  const at = "2026-08-21T16:00:00.000Z";

  const tally = (counts: number[], over: Record<string, any> = {}) => ({
    results: ["Yes", "No", "Abstain"].map((label, i) => ({
      optionId: `o${i + 1}`,
      label,
      count: counts[i] ?? 0,
    })),
    votesCast: counts.reduce((a, b) => a + b, 0),
    voters: counts.reduce((a, b) => a + b, 0),
    ...over,
  });

  const build = (counts: number[], over: Record<string, any> = {}) => {
    const { poll: pollOver, tally: tallyOver, ...rest } = over;
    return buildPollClosedEntry({
      organizationId: "org-1",
      organizationName: "Transition Test HOA",
      poll: { pollId: "p-3", title: "Should we repaint the lobby?", ...(pollOver ?? {}) },
      previousStatus: "open",
      tally: tallyOver ?? tally(counts),
      actor,
      occurredAt: at,
      ...rest,
    });
  };

  it("records the outcome and the tally", () => {
    const built = build([31, 12, 5]);
    expect(built?.summary).toBe("“Should we repaint the lobby?” closed with Yes ahead at 31 of 48 votes.");
    expect(built?.payload.outcome).toBe("Yes");
    expect(built?.payload.votes_cast).toBe(48);
  });

  it("never carries who voted which way — only counts, in ballot order", () => {
    // The guarantee this whole builder exists to make. A permanent, owner-visible
    // record of how each neighbour voted is what stops a community deciding
    // anything in the product; if this shape ever grows a voter list, that is a
    // product decision and not a refactor.
    const built = build([31, 12, 5]);
    expect(built?.payload.results).toEqual([
      { option: "Yes", votes: 31 },
      { option: "No", votes: 12 },
      { option: "Abstain", votes: 5 },
    ]);
    // The actor — who CLOSED the poll — is recorded, as on every entry. The
    // payload, which is everything about the vote itself, carries no person.
    const payload = JSON.stringify(built?.payload);
    expect(payload).not.toMatch(/option_id|user|member|email|@/i);
    // `voters` is a count of people, never a list of them.
    expect(typeof built?.payload.voters).toBe("number");
  });

  it("says a tie is a tie rather than picking a winner", () => {
    const built = build([24, 24, 3]);
    expect(built?.summary).toBe("“Should we repaint the lobby?” closed in a tie between Yes and No, at 24 votes each.");
    expect(built?.payload.outcome).toBeNull();
    expect(built?.payload.tied).toEqual(["Yes", "No"]);
  });

  it("keeps the row when nobody voted — that is a fact about the community too", () => {
    const built = build([0, 0, 0]);
    expect(built?.summary).toBe("“Should we repaint the lobby?” closed with no votes cast.");
    expect(built?.payload.outcome).toBeNull();
    expect(pollLeaders(tally([0, 0, 0]))).toEqual([]);
  });

  it("counts people separately from votes on a multiple-choice poll", () => {
    const built = build([31, 12, 5], {
      tally: { ...tally([31, 12, 5]), voters: 30 },
      poll: { allowMultiple: true },
    });
    expect(built?.payload.voters).toBe(30);
    expect(built?.payload.votes_cast).toBe(48);
    expect(built?.payload.multiple_choice).toBe(true);
  });

  it("is owner-visible, from the catalogue", () => {
    expect(build([1, 0, 0])?.visibility).toBe("owners");
    expect(defaultVisibilityFor("poll_closed")).toBe("owners");
  });

  it("writes nothing for a poll that was never open, or was closed already", () => {
    // A draft closed is a decision the community was never asked to make.
    expect(build([1, 0, 0], { previousStatus: "draft" })).toBeNull();
    expect(build([1, 0, 0], { previousStatus: "closed" })).toBeNull();
    expect(build([1, 0, 0], { previousStatus: null })).toBeNull();
  });
});

describe("rendering a payload a person can read", () => {
  it("humanizes keys and formats dates and booleans", () => {
    const rows = payloadRows({
      organization_name: "Transition Test HOA",
      grace_ends_at: "2026-10-19T00:00:00.000Z",
      had_grants: true,
      warnings: [],
    });
    expect(rows).toEqual([
      { label: "Community", value: "Transition Test HOA", depth: 0 },
      { label: "Grace period ends", value: "October 19, 2026", depth: 0 },
      { label: "Had permissions", value: "Yes", depth: 0 },
      { label: "Warnings", value: "None", depth: 0 },
    ]);
  });

  it("collapses a list of scalars onto one line", () => {
    const rows = payloadRows({ added: ["Projects", "Communications"] });
    expect(rows).toEqual([
      { label: "Permissions added", value: "Projects, Communications", depth: 0 },
    ]);
  });

  it("indents a list of objects under a heading, named by the human field", () => {
    const rows = payloadRows({
      outgoing: [{ member_id: "m-2", name: "Dana Reyes", email: "dana@example.com", had_grants: true }],
    });
    expect(rows).toEqual([
      { label: "Access ended", value: "", depth: 0 },
      { label: "Dana Reyes", value: "", depth: 1 },
      { label: "Member ID", value: "m-2", depth: 2 },
      { label: "Email", value: "dana@example.com", depth: 2 },
      { label: "Had permissions", value: "Yes", depth: 2 },
    ]);
  });

  it("says when it truncated a long list rather than dropping part of the record", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ name: `Person ${i + 1}` }));
    const rows = payloadRows({ outgoing: many });
    expect(rows.at(-1)).toEqual({ label: "and 3 more", value: "", depth: 1 });
  });

  it("renders a null nested object as None rather than blank", () => {
    expect(payloadRows({ successor: null })).toEqual([
      { label: "Successor", value: "None", depth: 0 },
    ]);
  });

  it("survives a payload that is not an object at all", () => {
    expect(payloadRows(null)).toEqual([]);
    expect(payloadRows("just a string")).toEqual([
      { label: "Record", value: "just a string", depth: 0 },
    ]);
  });

  it("reads a real Phase 4 transition payload end to end", () => {
    const built = buildTransitionAuditEntry({
      plan: {
        successor: { id: "m1", name: "Nina Alvarez", email: "nina@example.com", hasGrants: false } as any,
        outgoing: [{ id: "m2", name: "Dana Reyes", email: "dana@example.com", hasGrants: true } as any],
        graceEndsAt: "2026-10-19T00:00:00.000Z",
        steps: [{ kind: "promote_admin", label: "Promote Nina Alvarez", targetIds: ["m1"] }],
        warnings: [],
        blockers: [],
      } as any,
      organizationId: "org-1",
      organizationName: "Transition Test HOA",
      actor: { userId: "u1", name: "Demo", email: "demo@example.com" },
      occurredAt: "2026-08-20T16:07:33.311Z",
    });
    const rows = payloadRows(built.payload);
    const labels = rows.map((r) => r.label);
    const values = rows.map((r) => r.value);
    expect(labels).toContain("Community");
    // A single nested object keeps its own heading and lists its fields; a LIST
    // of objects is titled by each item's human name. Both read as prose.
    expect(labels).toContain("Successor");
    expect(values).toContain("Nina Alvarez");
    expect(labels).toContain("Dana Reyes");
    expect(labels).toContain("Promote Nina Alvarez");
    // No raw snake_case survives into what a board reads.
    expect(labels.some((l) => l.includes("_"))).toBe(false);
  });

  it("humanizes an unknown key without an override", () => {
    expect(humanizeKey("document_title")).toBe("Document title");
    expect(humanizeKey("")).toBe("Value");
  });
});

describe("dates and month grouping", () => {
  it("formats a date-only value without slipping a day in a western zone", () => {
    expect(formatDate("2026-10-19", "America/New_York")).toBe("October 19, 2026");
    expect(formatDate("2026-10-19", "UTC")).toBe("October 19, 2026");
  });

  it("leaves a value it does not understand alone", () => {
    expect(formatDate("not a date")).toBe("not a date");
    expect(formatDateTime("not a date")).toBe("not a date");
  });

  it("groups in the viewer's zone, not UTC", () => {
    // 8pm on August 31 in New York is September 1 in UTC. Filing it under
    // September while the row displays August 31 is the kind of small wrongness
    // that makes a permanent record look untrustworthy.
    const entries = [{ occurred_at: "2026-09-01T00:30:00.000Z" }];
    expect(groupByMonth(entries, "America/New_York")[0]?.key).toBe("2026-08");
    expect(groupByMonth(entries, "UTC")[0]?.key).toBe("2026-09");
  });

  it("groups consecutive months and preserves order", () => {
    const entries = [
      { occurred_at: "2026-08-20T16:00:00.000Z" },
      { occurred_at: "2026-08-02T16:00:00.000Z" },
      { occurred_at: "2026-07-30T16:00:00.000Z" },
    ];
    const groups = groupByMonth(entries, "UTC");
    expect(groups.map((g) => g.label)).toEqual(["August 2026", "July 2026"]);
    expect(groups[0]?.entries).toHaveLength(2);
  });

  it("does not lose an entry with an unreadable timestamp", () => {
    const groups = groupByMonth([{ occurred_at: "" }], "UTC");
    expect(groups[0]?.label).toBe("Undated");
    expect(groups[0]?.entries).toHaveLength(1);
  });
});

/**
 * The notices engine is the first thing in HOA Connect that speaks without
 * being spoken to, so the tests here are about the fences rather than the prose.
 *
 * Four properties, in descending order of how much damage getting them wrong
 * would do:
 *
 *   1. **Nothing proactive can transmit.** A proposed action may only name a
 *      reversible, internal executor. If `send_email`, `post_announcement` or
 *      `notify_board` could ever appear here, an org on autonomy tier 3 would
 *      have an unattended path from "a row got old" to "an email went out".
 *   2. **Tenancy.** Every generator reads on the admin client, so the org
 *      filter is the only thing standing between an id from another community
 *      and a notice about it.
 *   3. **Thresholds are edges, not vibes.** One day either side of each
 *      boundary, asserted, because "aged" quietly becoming 29 days is how a
 *      feed turns into noise.
 *   4. **Money arrives as a string.** Directus returns decimals as `"600.75"`,
 *      which concatenates where you expected addition — the classic silent
 *      $0.00. Coercion is tested directly.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@directus/sdk", () => ({
  readItems: (collection: string, query: unknown) => ({ op: "read", collection, query }),
}));

const ORG = "org-home";
const OTHER = "org-other";
const NOW = new Date("2026-08-24T12:00:00.000Z");

/** Rows the fake Directus will serve, keyed by collection. */
let rows: Record<string, any[]>;
let ops: Array<{ collection: string; query: any }>;

/** Days before NOW, as an ISO string. */
const daysAgo = (n: number): string =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();
/** Days after NOW, as a plain date (the shape Directus date columns return). */
const daysAhead = (n: number): string =>
  new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Apply just enough Directus filter syntax for these queries: `_and`, `_eq`,
 * `_in`, `_neq`, `_gt`, `_nnull`. Anything the generators don't use is absent
 * on purpose — a fake that accepts more than the real thing hides bugs.
 */
function matches(row: any, filter: any): boolean {
  if (!filter) return true;
  if (Array.isArray(filter._and)) return filter._and.every((f: any) => matches(row, f));
  return Object.entries(filter).every(([field, cond]: [string, any]) => {
    if (field === "_and") return true;
    const v = row[field];
    if (cond?._eq !== undefined) return String(v) === String(cond._eq);
    if (cond?._neq !== undefined) return String(v) !== String(cond._neq);
    if (cond?._in !== undefined) return (cond._in as any[]).map(String).includes(String(v));
    if (cond?._gt !== undefined) return Number(v) > Number(cond._gt);
    if (cond?._nnull !== undefined) return cond._nnull ? v != null : v == null;
    return true;
  });
}

const directus = {
  request: async (desc: { op: string; collection: string; query: any }) => {
    ops.push({ collection: desc.collection, query: desc.query });
    const all = rows[desc.collection] ?? [];
    let out = all.filter((r) => matches(r, desc.query?.filter));
    if (desc.query?.sort?.[0] === "-date_created") {
      out = [...out].sort(
        (a, b) => new Date(b.date_created).getTime() - new Date(a.date_created).getTime()
      );
    }
    const limit = desc.query?.limit;
    return typeof limit === "number" && limit > 0 ? out.slice(0, limit) : out;
  },
};

beforeEach(() => {
  ops = [];
  rows = {
    hoa_requests: [],
    hoa_members: [],
    hoa_projects: [],
    hoa_channels: [],
    hoa_channel_messages: [],
    hoa_vendors: [],
    hoa_meetings: [],
    payment_requests: [],
    ai_wallets: [],
  };
});

const {
  generateRequestNotices,
  generateMemberNotices,
  generateProjectNotices,
  generateChannelNotices,
  generateVendorNotices,
  generateMeetingNotices,
  generatePaymentRequestNotices,
  generateOrganizationNotices,
  collectOrgNotices,
  collectDirectorAgenda,
  sortNotices,
  PROACTIVE_ACTIONS,
  NOTICE_THRESHOLDS,
} = await import("#core/server/utils/ai-notices");

const { ACTION_CATALOG, actionByKey } = await import("#core/shared/ai/actions");

const ids = (ns: any[]) => ns.map((n) => n.id);

// ── 1. Nothing proactive can transmit ────────────────────────────────────────

describe("the outbound cap", () => {
  it("allow-lists only executors the catalog agrees are internal", () => {
    for (const key of PROACTIVE_ACTIONS) {
      const def = actionByKey(key);
      expect(def, `${key} is not in ACTION_CATALOG`).toBeDefined();
      expect(def!.outbound, `${key} is outbound`).toBe(false);
    }
  });

  it("excludes every outbound executor the catalog knows about", () => {
    const outbound = ACTION_CATALOG.filter((a) => a.outbound).map((a) => a.key);
    // If this list ever empties, the assertion below becomes vacuous.
    expect(outbound).toEqual(
      expect.arrayContaining(["send_email", "post_announcement", "notify_board"])
    );
    for (const key of outbound) {
      expect(PROACTIVE_ACTIONS as readonly string[]).not.toContain(key);
    }
  });

  it("never emits a proposal outside the allow-list across a full sweep", async () => {
    rows.hoa_requests = [
      { id: "r1", organization: ORG, status: "open", title: "Leak", date_created: daysAgo(60) },
    ];
    rows.hoa_projects = [
      { id: "p1", organization: ORG, status: "active", title: "Roof", date_updated: daysAgo(90) },
    ];
    rows.hoa_vendors = [
      { id: "v1", organization: ORG, status: "active", company: "Acme", active_until: daysAhead(-10) },
    ];
    rows.hoa_meetings = [
      { id: "m1", organization: ORG, status: "completed", title: "Annual", meeting_date: daysAgo(40), minutes: "" },
    ];

    const all = await collectOrgNotices(directus, ORG, NOW);
    const proposed = all.filter((n) => n.proposedAction);
    expect(proposed.length).toBeGreaterThan(0);
    for (const n of proposed) {
      expect(PROACTIVE_ACTIONS as readonly string[]).toContain(n.proposedAction!.actionType);
    }
  });
});

// ── 2. Tenancy ───────────────────────────────────────────────────────────────

describe("tenancy", () => {
  it("returns nothing for an entity in another community", async () => {
    rows.hoa_requests = [
      { id: "r1", organization: OTHER, status: "open", title: "Theirs", date_created: daysAgo(90) },
    ];
    expect(await generateRequestNotices(directus, "r1", ORG, NOW)).toEqual([]);
  });

  it("puts the org filter on every single-entity read", async () => {
    rows.hoa_members = [
      { id: "m1", organization: ORG, status: "active", outstanding_balance: "10.00" },
    ];
    await generateMemberNotices(directus, "m1", ORG, NOW);
    expect(ops[0].query.filter.organization).toEqual({ _eq: ORG });
  });

  it("keeps another community's rows out of an org-wide sweep", async () => {
    rows.hoa_requests = [
      { id: "mine", organization: ORG, status: "open", title: "Mine", date_created: daysAgo(60) },
      { id: "theirs", organization: OTHER, status: "open", title: "Theirs", date_created: daysAgo(60) },
    ];
    const all = await collectOrgNotices(directus, ORG, NOW);
    expect(all.every((n) => n.entityId !== "theirs")).toBe(true);
    expect(ids(all)).toContain("request-aged-mine");
  });
});

// ── 3. Thresholds ────────────────────────────────────────────────────────────

describe("requests", () => {
  const req = (over: Record<string, any>) => [
    { id: "r1", organization: ORG, status: "open", title: "Leak in B2", assigned_to: "u1", ...over },
  ];

  it("counts whole elapsed days — a 31-day-old row is 31, not 32", async () => {
    // Real rows are never an exact multiple of a day old. Negating a floored
    // negative delta rounds ages UP, so a request seeded 31 days and 45 seconds
    // ago reported "Open 32 days". The browser found this; a fixture built from
    // `now - 31 days` is exact and cannot.
    rows.hoa_requests = req({
      date_created: new Date(NOW.getTime() - (31 * 86_400_000 + 45_000)).toISOString(),
    });
    const [aged] = await generateRequestNotices(directus, "r1", ORG, NOW);
    expect(aged.title).toContain("Open 31 days");
  });

  it("does not age a row Directus stamped a moment into the future", async () => {
    rows.hoa_requests = req({ date_created: new Date(NOW.getTime() + 4_000).toISOString() });
    expect(await generateRequestNotices(directus, "r1", ORG, NOW)).toEqual([]);
  });

  it("is silent the day before the aged threshold and speaks the day after", async () => {
    rows.hoa_requests = req({ date_created: daysAgo(NOTICE_THRESHOLDS.REQUEST_AGED_DAYS - 1) });
    expect(ids(await generateRequestNotices(directus, "r1", ORG, NOW))).not.toContain("request-aged-r1");

    rows.hoa_requests = req({ date_created: daysAgo(NOTICE_THRESHOLDS.REQUEST_AGED_DAYS + 1) });
    expect(ids(await generateRequestNotices(directus, "r1", ORG, NOW))).toContain("request-aged-r1");
  });

  it("says nothing at all about a resolved or closed request", async () => {
    for (const status of ["resolved", "closed"]) {
      rows.hoa_requests = req({ status, date_created: daysAgo(400) });
      expect(await generateRequestNotices(directus, "r1", ORG, NOW)).toEqual([]);
    }
  });

  it("flags a past due date separately from age", async () => {
    rows.hoa_requests = req({ date_created: daysAgo(2), due_date: daysAhead(-5) });
    const out = await generateRequestNotices(directus, "r1", ORG, NOW);
    expect(ids(out)).toEqual(["request-overdue-r1"]);
    expect(out[0].title).toContain("5 days past due");
  });

  it("does not flag a due date still in the future", async () => {
    rows.hoa_requests = req({ date_created: daysAgo(2), due_date: daysAhead(5) });
    expect(ids(await generateRequestNotices(directus, "r1", ORG, NOW))).toEqual([]);
  });

  it("names an unowned request once it has sat unassigned", async () => {
    rows.hoa_requests = req({
      assigned_to: null,
      date_created: daysAgo(NOTICE_THRESHOLDS.REQUEST_UNASSIGNED_DAYS + 1),
    });
    expect(ids(await generateRequestNotices(directus, "r1", ORG, NOW))).toContain(
      "request-unassigned-r1"
    );
  });

  it("proposes a follow-up task carrying the request id, so the task lands on the record", async () => {
    rows.hoa_requests = req({ date_created: daysAgo(45) });
    const [aged] = await generateRequestNotices(directus, "r1", ORG, NOW);
    expect(aged.proposedAction?.actionType).toBe("create_task");
    expect(aged.proposedAction?.payload.request_id).toBe("r1");
  });
});

describe("member balances", () => {
  it("coerces a string decimal instead of concatenating it", async () => {
    // "600.75" is what Directus actually returns. The bug this guards is a
    // silent $0.00 (or NaN in the score), not a crash.
    rows.hoa_members = [
      {
        id: "m1", organization: ORG, status: "active",
        first_name: "Ada", last_name: "Lovelace",
        outstanding_balance: "600.75", payment_status: "overdue",
        last_payment_date: daysAgo(40),
      },
    ];
    const [n] = await generateMemberNotices(directus, "m1", ORG, NOW);
    expect(n.title).toContain("$600.75");
    expect(Number.isFinite(n.score)).toBe(true);
    expect(n.score).toBeGreaterThan(40);
  });

  it("says nothing when the balance is zero or settled", async () => {
    rows.hoa_members = [
      { id: "m1", organization: ORG, status: "active", outstanding_balance: "0.00" },
    ];
    expect(await generateMemberNotices(directus, "m1", ORG, NOW)).toEqual([]);
  });

  it("ignores an inactive member", async () => {
    rows.hoa_members = [
      { id: "m1", organization: ORG, status: "inactive", outstanding_balance: "900.00" },
    ];
    expect(await generateMemberNotices(directus, "m1", ORG, NOW)).toEqual([]);
  });

  it("does not invent an age for a member who has never paid", async () => {
    // No last_payment_date means no anchor. Scoring it as ancient is exactly
    // how a nine-year-old account pins itself to the top of the feed.
    rows.hoa_members = [
      { id: "m1", organization: ORG, status: "active", outstanding_balance: "300.00", last_payment_date: null },
    ];
    const [n] = await generateMemberNotices(directus, "m1", ORG, NOW);
    expect(n.description).toContain("no payment has been recorded");
    expect(n.priority).not.toBe("urgent");
  });
});

describe("projects", () => {
  it("goes quiet exactly at the stale threshold", async () => {
    const p = (d: number) => [
      { id: "p1", organization: ORG, status: "active", title: "Roof", date_updated: daysAgo(d) },
    ];
    rows.hoa_projects = p(NOTICE_THRESHOLDS.PROJECT_STALE_DAYS - 1);
    expect(ids(await generateProjectNotices(directus, "p1", ORG, NOW))).not.toContain("project-stale-p1");
    rows.hoa_projects = p(NOTICE_THRESHOLDS.PROJECT_STALE_DAYS);
    expect(ids(await generateProjectNotices(directus, "p1", ORG, NOW))).toContain("project-stale-p1");
  });

  it("leaves completed and archived projects alone", async () => {
    for (const status of ["completed", "archived"]) {
      rows.hoa_projects = [
        { id: "p1", organization: ORG, status, title: "Roof", date_updated: daysAgo(400) },
      ];
      expect(await generateProjectNotices(directus, "p1", ORG, NOW)).toEqual([]);
    }
  });

  it("reports an overrun using coerced decimals", async () => {
    rows.hoa_projects = [
      {
        id: "p1", organization: ORG, status: "active", title: "Roof",
        date_updated: daysAgo(1), budget_amount: "10000.00", actual_spend: "12500.50",
      },
    ];
    const out = await generateProjectNotices(directus, "p1", ORG, NOW);
    const over = out.find((n) => n.id === "project-overbudget-p1");
    expect(over?.title).toContain("$2,500.50");
  });

  it("says nothing about spend when there is no budget to exceed", async () => {
    rows.hoa_projects = [
      {
        id: "p1", organization: ORG, status: "active", title: "Roof",
        date_updated: daysAgo(1), budget_amount: null, actual_spend: "9999.00",
      },
    ];
    expect(ids(await generateProjectNotices(directus, "p1", ORG, NOW))).toEqual([]);
  });
});

describe("channels", () => {
  const chan = [{ id: "c1", organization: ORG, status: "published", name: "board", slug: "board" }];

  it("stays silent about a channel nobody has ever written in", async () => {
    rows.hoa_channels = chan;
    rows.hoa_channel_messages = [];
    expect(await generateChannelNotices(directus, "c1", ORG, NOW)).toEqual([]);
  });

  it("speaks once the newest message has gone unanswered long enough", async () => {
    rows.hoa_channels = chan;
    rows.hoa_channel_messages = [
      { id: "x", channel: "c1", status: "published", date_created: daysAgo(NOTICE_THRESHOLDS.CHANNEL_QUIET_DAYS - 1) },
    ];
    expect(await generateChannelNotices(directus, "c1", ORG, NOW)).toEqual([]);

    rows.hoa_channel_messages = [
      { id: "x", channel: "c1", status: "published", date_created: daysAgo(NOTICE_THRESHOLDS.CHANNEL_QUIET_DAYS + 2) },
    ];
    const out = await generateChannelNotices(directus, "c1", ORG, NOW);
    expect(ids(out)).toEqual(["channel-waiting-c1"]);
  });

  it("measures from the NEWEST message, not the first row returned", async () => {
    rows.hoa_channels = chan;
    rows.hoa_channel_messages = [
      { id: "old", channel: "c1", status: "published", date_created: daysAgo(90) },
      { id: "new", channel: "c1", status: "published", date_created: daysAgo(1) },
    ];
    expect(await generateChannelNotices(directus, "c1", ORG, NOW)).toEqual([]);
  });

  it("ignores an archived channel", async () => {
    rows.hoa_channels = [{ id: "c1", organization: ORG, status: "archived", name: "old", slug: "old" }];
    rows.hoa_channel_messages = [
      { id: "x", channel: "c1", status: "published", date_created: daysAgo(200) },
    ];
    expect(await generateChannelNotices(directus, "c1", ORG, NOW)).toEqual([]);
  });
});

describe("vendors", () => {
  const v = (until: string | null, status = "active") => [
    { id: "v1", organization: ORG, status, company: "Acme Roofing", active_until: until },
  ];

  it("warns inside the expiry window and not before it", async () => {
    rows.hoa_vendors = v(daysAhead(NOTICE_THRESHOLDS.VENDOR_EXPIRING_DAYS + 1));
    expect(await generateVendorNotices(directus, "v1", ORG, NOW)).toEqual([]);
    rows.hoa_vendors = v(daysAhead(NOTICE_THRESHOLDS.VENDOR_EXPIRING_DAYS));
    expect(ids(await generateVendorNotices(directus, "v1", ORG, NOW))).toEqual(["vendor-expiring-v1"]);
  });

  it("escalates to lapsed once the date has passed", async () => {
    rows.hoa_vendors = v(daysAhead(-3));
    const out = await generateVendorNotices(directus, "v1", ORG, NOW);
    expect(ids(out)).toEqual(["vendor-lapsed-v1"]);
    expect(out[0].proposedAction?.actionType).toBe("create_task");
  });

  it("says nothing about a vendor with no end date recorded", async () => {
    rows.hoa_vendors = v(null);
    expect(await generateVendorNotices(directus, "v1", ORG, NOW)).toEqual([]);
  });

  it("says nothing about an inactive vendor, lapsed or not", async () => {
    rows.hoa_vendors = v(daysAhead(-300), "inactive");
    expect(await generateVendorNotices(directus, "v1", ORG, NOW)).toEqual([]);
  });
});

describe("meetings", () => {
  const meet = (over: Record<string, any>) => [
    { id: "mt1", organization: ORG, status: "completed", title: "Annual meeting", ...over },
  ];

  it("waits out the grace period before asking for minutes", async () => {
    rows.hoa_meetings = meet({ meeting_date: daysAgo(NOTICE_THRESHOLDS.MEETING_MINUTES_DAYS - 1), minutes: null });
    expect(await generateMeetingNotices(directus, "mt1", ORG, NOW)).toEqual([]);
    rows.hoa_meetings = meet({ meeting_date: daysAgo(NOTICE_THRESHOLDS.MEETING_MINUTES_DAYS), minutes: null });
    expect(ids(await generateMeetingNotices(directus, "mt1", ORG, NOW))).toEqual(["meeting-minutes-mt1"]);
  });

  it("treats whitespace-only minutes as no minutes", async () => {
    rows.hoa_meetings = meet({ meeting_date: daysAgo(30), minutes: "   \n  " });
    expect(ids(await generateMeetingNotices(directus, "mt1", ORG, NOW))).toEqual(["meeting-minutes-mt1"]);
  });

  it("is satisfied by real minutes", async () => {
    rows.hoa_meetings = meet({ meeting_date: daysAgo(30), minutes: "Motion carried 4-1." });
    expect(await generateMeetingNotices(directus, "mt1", ORG, NOW)).toEqual([]);
  });

  it("never chases a meeting that has not happened yet", async () => {
    rows.hoa_meetings = meet({ status: "scheduled", meeting_date: daysAhead(30), minutes: null });
    expect(await generateMeetingNotices(directus, "mt1", ORG, NOW)).toEqual([]);
  });

  it("leaves a cancelled meeting alone", async () => {
    rows.hoa_meetings = meet({ status: "canceled", meeting_date: daysAgo(60), minutes: null });
    expect(await generateMeetingNotices(directus, "mt1", ORG, NOW)).toEqual([]);
  });
});

describe("unpaid invoices", () => {
  const pr = (over: Record<string, any>) => [
    {
      id: "i1", organization: ORG, status: "active", title: "Q3 assessment",
      amount: "1200.00", amount_paid: "0.00", amount_remaining: "1200.00", ...over,
    },
  ];

  it("only counts one that is actually past due", async () => {
    rows.payment_requests = pr({ due_date: daysAhead(5) });
    expect(await generatePaymentRequestNotices(directus, "i1", ORG, NOW)).toEqual([]);
    rows.payment_requests = pr({ due_date: daysAhead(-5) });
    expect(ids(await generatePaymentRequestNotices(directus, "i1", ORG, NOW))).toEqual(["invoice-overdue-i1"]);
  });

  it("reports the REMAINING amount after a partial payment, not the full one", async () => {
    rows.payment_requests = pr({
      status: "partially_paid", due_date: daysAhead(-10),
      amount_paid: "900.00", amount_remaining: "300.00",
    });
    const [n] = await generatePaymentRequestNotices(directus, "i1", ORG, NOW);
    expect(n.title).toContain("$300.00");
    expect(n.description).toContain("$300.00 of $1,200.00");
  });

  it("says nothing once it is paid or cancelled", async () => {
    for (const status of ["paid", "canceled", "draft"]) {
      rows.payment_requests = pr({ status, due_date: daysAhead(-30) });
      expect(await generatePaymentRequestNotices(directus, "i1", ORG, NOW)).toEqual([]);
    }
  });

  it("says nothing when nothing is left owing, whatever the status says", async () => {
    rows.payment_requests = pr({ due_date: daysAhead(-30), amount_remaining: "0.00" });
    expect(await generatePaymentRequestNotices(directus, "i1", ORG, NOW)).toEqual([]);
  });
});

describe("AI credits", () => {
  it("warns near the floor", async () => {
    rows.ai_wallets = [
      { id: "w1", organization: ORG, balance_credits: 20, allowance_credits: 500, auto_refill_enabled: false },
    ];
    expect(ids(await generateOrganizationNotices(directus, ORG, NOW))).toEqual([`org-credits-${ORG}`]);
  });

  it("stays quiet when auto-refill will handle it", async () => {
    rows.ai_wallets = [
      { id: "w1", organization: ORG, balance_credits: 0, allowance_credits: 500, auto_refill_enabled: true },
    ];
    expect(await generateOrganizationNotices(directus, ORG, NOW)).toEqual([]);
  });

  it("stays quiet on a healthy balance", async () => {
    rows.ai_wallets = [
      { id: "w1", organization: ORG, balance_credits: 480, allowance_credits: 500, auto_refill_enabled: false },
    ];
    expect(await generateOrganizationNotices(directus, ORG, NOW)).toEqual([]);
  });
});

// ── Sweep, ordering and the agenda ───────────────────────────────────────────

describe("the sweep", () => {
  it("survives a collection that will not read", async () => {
    const flaky = {
      request: async (desc: any) => {
        if (desc.collection === "hoa_projects") throw new Error("directus said no");
        return directus.request(desc);
      },
    };
    rows.hoa_requests = [
      { id: "r1", organization: ORG, status: "open", title: "Leak", date_created: daysAgo(60) },
    ];
    rows.hoa_projects = [
      { id: "p1", organization: ORG, status: "active", title: "Roof", date_updated: daysAgo(90) },
    ];
    const all = await collectOrgNotices(flaky, ORG, NOW);
    expect(ids(all)).toContain("request-aged-r1");
    expect(ids(all)).not.toContain("project-stale-p1");
  });

  it("sorts by priority then score, deterministically", async () => {
    const notices = sortNotices([
      { id: "b", priority: "high", score: 70 } as any,
      { id: "a", priority: "urgent", score: 90 } as any,
      { id: "d", priority: "high", score: 70 } as any,
      { id: "c", priority: "high", score: 75 } as any,
      { id: "e", priority: "low", score: 40 } as any,
    ]);
    expect(ids(notices)).toEqual(["a", "c", "b", "d", "e"]);
  });
});

describe("the Board Room agenda", () => {
  it("buckets money from both members and invoices into one subject", async () => {
    rows.hoa_members = [
      { id: "m1", organization: ORG, status: "active", first_name: "Ada", last_name: "L",
        outstanding_balance: "600.00", last_payment_date: daysAgo(40) },
    ];
    rows.payment_requests = [
      { id: "i1", organization: ORG, status: "active", title: "Q3", amount: "1200.00",
        amount_remaining: "1200.00", due_date: daysAhead(-10) },
    ];
    const agenda = await collectDirectorAgenda(directus, ORG, NOW);
    const money = agenda.groups.find((g) => g.subject === "money");
    expect(money?.notices.map((n) => n.entityType).sort()).toEqual(["member", "payment_request"]);
  });

  it("always tables money, even when nobody owes anything", async () => {
    const agenda = await collectDirectorAgenda(directus, ORG, NOW);
    expect(agenda.groups.map((g) => g.subject)).toContain("money");
    expect(agenda.groups.find((g) => g.subject === "money")!.notices).toEqual([]);
  });

  it("orders groups by their most urgent item", async () => {
    rows.hoa_vendors = [
      { id: "v1", organization: ORG, status: "active", company: "Acme", active_until: daysAhead(20) },
    ];
    rows.hoa_requests = [
      { id: "r1", organization: ORG, status: "open", title: "Leak", date_created: daysAgo(60) },
    ];
    const agenda = await collectDirectorAgenda(directus, ORG, NOW);
    expect(agenda.groups[0].subject).toBe("requests");
  });

  it("focuses on one entity without sweeping the org", async () => {
    rows.hoa_requests = [
      { id: "r1", organization: ORG, status: "open", title: "Leak", date_created: daysAgo(60) },
      { id: "r2", organization: ORG, status: "open", title: "Gate", date_created: daysAgo(60) },
    ];
    const agenda = await collectDirectorAgenda(directus, ORG, NOW, {
      entityType: "request",
      entityId: "r1",
    });
    expect(agenda.mode).toBe("entity");
    expect(agenda.groups.flatMap((g) => g.notices).every((n) => n.entityId === "r1")).toBe(true);
  });

  it("returns an empty agenda for an entity type it has no generator for", async () => {
    const agenda = await collectDirectorAgenda(directus, ORG, NOW, {
      entityType: "unicorn",
      entityId: "u1",
    });
    expect(agenda.totalNotices).toBe(0);
  });

  it("counts proposable items across the whole group, not just the visible slice", async () => {
    rows.hoa_requests = Array.from({ length: 15 }, (_, i) => ({
      id: `r${i}`, organization: ORG, status: "open", title: `R${i}`,
      assigned_to: "u1", date_created: daysAgo(60),
    }));
    const agenda = await collectDirectorAgenda(directus, ORG, NOW);
    const reqs = agenda.groups.find((g) => g.subject === "requests")!;
    expect(reqs.notices.length).toBe(12); // capped for readability
    expect(reqs.proposedCount).toBe(15); // but the count tells the truth
  });
});

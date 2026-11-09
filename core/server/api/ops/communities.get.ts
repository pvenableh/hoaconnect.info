// GET /api/ops/communities — every community, searchable, filterable, paginated.
// App Admin and Platform Support (`billing.read`).
//
// Query: q (name or slug), filter (a quick filter or a status), sort, page, pageSize.
// The community count is small enough to bucket in memory after one read; the
// page is cut on the server so the phone gets 25 rows, not all of them.
import { requireOpsPermission } from "#core/server/utils/admin-auth";
import { loadOpsCommunities, opsSubscriptions, type OpsCommunityRow } from "#core/server/utils/ops-data";
import { getStripe } from "#core/server/utils/stripe";
import { countStatuses } from "#core/shared/ops/metrics";

const OPS_COMMUNITY_FILTERS = [
  "all",
  "trial_ending",
  "past_due",
  "no_units",
  "free",
  "agency",
  "active",
  "trial",
  "expired",
  "canceled",
] as const;
type OpsCommunityFilter = (typeof OPS_COMMUNITY_FILTERS)[number];

const SORTS = ["name", "signup", "value", "trial_end", "units"] as const;

function matchesFilter(row: OpsCommunityRow, filter: OpsCommunityFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "trial_ending":
      return row.trialEndingSoon;
    case "no_units":
      return row.realUnits === 0;
    case "agency":
      return row.agency;
    default:
      return row.status === filter;
  }
}

export default defineEventHandler(async (event) => {
  await requireOpsPermission(event, "billing.read");
  const query = getQuery(event);

  const q = String(query.q ?? "").trim().toLowerCase().slice(0, 100);
  const filter = (OPS_COMMUNITY_FILTERS as readonly string[]).includes(String(query.filter))
    ? (query.filter as OpsCommunityFilter)
    : "all";
  const sort = (SORTS as readonly string[]).includes(String(query.sort)) ? String(query.sort) : "name";
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const page = Math.max(1, Math.floor(Number(query.page) || 1));

  const { rows } = await loadOpsCommunities();
  let warning: string | null = null;
  let subsById = new Map<string, any>();
  try {
    const { subs } = await opsSubscriptions(getStripe());
    subsById = new Map(subs.map((s) => [s.id, s]));
  } catch (e: any) {
    console.error("[ops/communities] Stripe read failed:", e?.message ?? e);
    warning = "Stripe couldn't be read just now, so monthly values are missing.";
  }
  const all = rows(subsById);

  const searched = q
    ? all.filter((r) => r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q))
    : all;
  const filtered = searched.filter((r) => matchesFilter(r, filter));

  const by: Record<string, (a: OpsCommunityRow, b: OpsCommunityRow) => number> = {
    name: (a, b) => a.name.localeCompare(b.name),
    signup: (a, b) => String(b.signupAt ?? "").localeCompare(String(a.signupAt ?? "")),
    value: (a, b) => (b.monthlyValueCents ?? -1) - (a.monthlyValueCents ?? -1),
    trial_end: (a, b) => String(a.trialEndsAt ?? "9999").localeCompare(String(b.trialEndsAt ?? "9999")),
    units: (a, b) => b.realUnits - a.realUnits,
  };
  filtered.sort((a, b) => by[sort]!(a, b) || a.name.localeCompare(b.name));

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  return {
    rows: filtered.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    filter,
    sort,
    // Counts over the search, before the quick filter, so each chip shows what it would give.
    counts: { ...countStatuses(searched), no_units: searched.filter((r) => r.realUnits === 0).length },
    warning,
  };
});

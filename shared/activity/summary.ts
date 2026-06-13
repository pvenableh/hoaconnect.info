// Pure aggregation for the admin activity dashboard. Turns a flat list of
// hoa_activity rows into the cards/charts/top-lists the UI renders. Framework-
// free + deterministic so it's unit-testable and the dashboard stays thin.

export interface ActivityMemberRef {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

export interface ActivityRow {
  id?: string;
  event_type?: string | null;
  path?: string | null;
  target_collection?: string | null;
  target_id?: string | null;
  label?: string | null;
  date_created?: string | null;
  member?: ActivityMemberRef | string | null;
}

export interface CountItem {
  key: string;
  label: string;
  count: number;
}

export interface ActivitySummary {
  total: number;
  pageViews: number;
  downloads: number;
  docViews: number;
  logins: number;
  /** Distinct members with at least one event. */
  activeMembers: number;
  byType: Record<string, number>;
  /** 'YYYY-MM-DD' (UTC) → event count. */
  byDay: Record<string, number>;
  /** Most-downloaded / viewed targets (downloads + doc_views). */
  topTargets: CountItem[];
  /** Most-visited page paths (page_views). */
  topPaths: CountItem[];
  /** Most-active members. */
  topMembers: CountItem[];
}

/** Human label for a member ref (object or id). */
export function memberLabel(member: ActivityRow["member"]): string {
  if (!member) return "Unknown";
  if (typeof member === "string") return "Member";
  const name = [member.first_name, member.last_name].filter(Boolean).join(" ").trim();
  return name || member.email || "Member";
}

function memberId(member: ActivityRow["member"]): string | null {
  if (!member) return null;
  return typeof member === "string" ? member : member.id ?? null;
}

function dayKey(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  // ISO timestamps slice cleanly to the UTC date; fall back to Date for others.
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.slice(0, 10);
  const t = new Date(dateStr);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
}

function topN(map: Map<string, { label: string; count: number }>, n: number): CountItem[] {
  return [...map.entries()]
    .map(([key, v]) => ({ key, label: v.label, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/** Aggregate a window of activity rows for the dashboard. */
export function summarizeActivity(events: ActivityRow[], topLimit = 5): ActivitySummary {
  const byType: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  const members = new Set<string>();
  const targetMap = new Map<string, { label: string; count: number }>();
  const pathMap = new Map<string, { label: string; count: number }>();
  const memberMap = new Map<string, { label: string; count: number }>();

  for (const e of events) {
    const type = e.event_type || "unknown";
    byType[type] = (byType[type] || 0) + 1;

    const day = dayKey(e.date_created);
    if (day) byDay[day] = (byDay[day] || 0) + 1;

    const mId = memberId(e.member);
    if (mId) {
      members.add(mId);
      const prev = memberMap.get(mId);
      if (prev) prev.count += 1;
      else memberMap.set(mId, { label: memberLabel(e.member), count: 1 });
    }

    if (type === "download" || type === "doc_view") {
      const key = e.target_id || e.label || "unknown";
      const prev = targetMap.get(key);
      if (prev) prev.count += 1;
      else targetMap.set(key, { label: e.label || e.target_id || "Document", count: 1 });
    }

    if (type === "page_view" && e.path) {
      const prev = pathMap.get(e.path);
      if (prev) prev.count += 1;
      else pathMap.set(e.path, { label: e.path, count: 1 });
    }
  }

  return {
    total: events.length,
    pageViews: byType.page_view || 0,
    downloads: byType.download || 0,
    docViews: byType.doc_view || 0,
    logins: (byType.login || 0) + (byType.session_start || 0),
    activeMembers: members.size,
    byType,
    byDay,
    topTargets: topN(targetMap, topLimit),
    topPaths: topN(pathMap, topLimit),
    topMembers: topN(memberMap, topLimit),
  };
}

/**
 * Build a continuous daily series (fills zero days) for the chart, oldest→newest.
 * `days` is the window length ending at `end` (UTC date string 'YYYY-MM-DD').
 */
export function dailySeries(
  byDay: Record<string, number>,
  end: string,
  days: number
): { date: string; count: number }[] {
  const endMs = Date.parse(end + "T00:00:00Z");
  if (Number.isNaN(endMs)) return [];
  const out: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endMs - i * 86400000).toISOString().slice(0, 10);
    out.push({ date: d, count: byDay[d] || 0 });
  }
  return out;
}

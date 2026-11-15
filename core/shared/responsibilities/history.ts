/**
 * A member's service history (plan §3.4: "every office held and every job
 * held, with dates"). Offices come from their board terms. Jobs come from
 * holder rows that name them (as a member or as a user) and from office rows
 * during their terms of that office: a Treasurer row from January to
 * December, with Ann treasurer from March to June, puts that job in Ann's
 * history from March to June. Pure.
 */
import { officeLabel, roleLabel, type AssigneeRole } from "./config";
import type { StoredAssignee, StoredResponsibility, TermWithName } from "./views";

export interface OfficeHeld {
  termId: string;
  office: string;
  label: string;
  from: string | null;
  to: string | null;
  endReason: string | null;
  status: string | null;
}

export interface JobHeld {
  jobId: string;
  title: string;
  category: string;
  role: AssigneeRole;
  roleLabel: string;
  from: string | null;
  to: string | null;
  /** How they held it: named on the row, or by holding the office it names. */
  via: "member" | "user" | "office";
  office?: string;
}

export interface ServiceHistory {
  offices: OfficeHeld[];
  jobs: JobHeld[];
}

const idOf = (v: unknown): string | null =>
  typeof v === "string" ? v : v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" ? (v as { id: string }).id : null;

const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);
const earlier = (a: string | null, b: string | null) => (!a ? b : !b ? a : a < b ? a : b);
const newestFirst = (a: { from: string | null }, b: { from: string | null }) => String(b.from ?? "").localeCompare(String(a.from ?? ""));

export function serviceHistory(
  member: { id: string; user?: string | null },
  terms: readonly TermWithName[],
  assignees: readonly StoredAssignee[],
  jobs: readonly StoredResponsibility[]
): ServiceHistory {
  const mine = terms.filter((t) => idOf(t.hoa_member) === member.id);
  const offices: OfficeHeld[] = mine
    .map((t) => ({
      termId: t.id,
      office: String(t.title ?? ""),
      label: officeLabel(t.title),
      from: t.term_start ?? null,
      to: t.term_end ?? null,
      endReason: t.end_reason ?? null,
      status: t.status ?? null,
    }))
    .sort(newestFirst);

  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const out: JobHeld[] = [];
  const push = (a: StoredAssignee, from: string | null, to: string | null, via: JobHeld["via"], office?: string) => {
    const j = jobById.get(a.responsibility);
    if (!j) return;
    const role = ((a.role as AssigneeRole) || "owner") as AssigneeRole;
    out.push({ jobId: j.id, title: j.title, category: String(j.category), role, roleLabel: roleLabel(role), from, to, via, ...(office ? { office } : {}) });
  };

  for (const a of assignees) {
    if (idOf(a.member) === member.id) push(a, a.start_date ?? null, a.end_date ?? null, "member");
    else if (member.user && idOf(a.user) === member.user) push(a, a.start_date ?? null, a.end_date ?? null, "user");
    else if (typeof a.office === "string") {
      for (const t of mine) {
        if (t.title !== a.office || t.status !== "published") continue;
        const from = later(a.start_date ?? null, t.term_start ?? null);
        const to = earlier(a.end_date ?? null, t.term_end ?? null);
        if (from && to && to < from) continue;
        push(a, from, to, "office", a.office);
      }
    }
  }
  return { offices, jobs: out.sort(newestFirst) };
}

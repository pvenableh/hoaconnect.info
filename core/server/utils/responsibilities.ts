/**
 * The responsibilities register's server side (docs/spec-responsibilities.md):
 * loading rows for one community, resolving holder names, checking that every
 * id a body names belongs to that community, freezing names, and the activity
 * row each write leaves. Every read uses the admin token and filters on the
 * organization; no Directus policy reads these collections.
 */
import type { H3Event } from "h3";
import { createItem, readItem, readItems, readUsers } from "@directus/sdk";
import { isAreaKey } from "#core/shared/transition/grants";
import { todayUtc } from "#core/shared/roles/role-context";
import { isDateOnly, targetOf, type Target } from "#core/shared/responsibilities/holders";
import {
  emptyNames,
  liveName,
  registerRows,
  type NameBook,
  type RegisterExtras,
  type RegisterRow,
  type StoredAssignee,
  type StoredResponsibility,
  type TermWithName,
} from "#core/shared/responsibilities/views";
import type { ResponsibilityAccess } from "./responsibility-access";

export const RESPONSIBILITY_FIELDS = [
  "id", "organization", "title", "description", "category", "cadence", "basis", "basis_reference",
  "area", "status", "last_verified", "last_verified_by", "member_visible", "project", "notes", "sort",
  "date_created", "date_updated",
] as const;

export const ASSIGNEE_FIELDS = [
  "id", "organization", "responsibility", "office", "member", "user", "vendor", "team", "label",
  "role", "start_date", "end_date", "holder_name", "notes", "sort", "date_created",
] as const;

export const TERM_FIELDS = [
  "id", "title", "status", "term_start", "term_end", "end_reason", "holder_name", "message", "icon",
  "hoa_member.id", "hoa_member.first_name", "hoa_member.last_name", "hoa_member.organization",
] as const;

const idOf = (v: unknown): string | null =>
  typeof v === "string" ? v : v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" ? (v as { id: string }).id : null;

const fullName = (r: { first_name?: string | null; last_name?: string | null } | null | undefined): string | null => {
  const n = [r?.first_name, r?.last_name].filter(Boolean).join(" ").trim();
  return n || null;
};

const day = (v: unknown): string | null => (v ? String(v).slice(0, 10) : null);

/** An `asOf` query value, or today. 400 on a malformed date. */
export function asOfParam(event: H3Event): string {
  const raw = getQuery(event).asOf;
  if (raw === undefined || raw === null || raw === "") return todayUtc();
  if (!isDateOnly(raw)) throw createError({ statusCode: 400, message: "asOf must be a date (YYYY-MM-DD)" });
  return String(raw);
}

/** Normalise a stored row's dates to YYYY-MM-DD and its relations to ids. */
function normaliseJob(r: any): StoredResponsibility {
  return {
    ...r,
    last_verified: day(r.last_verified),
    last_verified_by: idOf(r.last_verified_by),
    project: idOf(r.project),
  };
}

function normaliseAssignee(r: any): StoredAssignee {
  return {
    ...r,
    responsibility: idOf(r.responsibility)!,
    member: idOf(r.member),
    user: idOf(r.user),
    vendor: idOf(r.vendor),
    team: idOf(r.team),
    start_date: day(r.start_date),
    end_date: day(r.end_date),
  };
}

export function normaliseTerm(r: any): TermWithName & { organization: string | null; message?: string | null; icon?: string | null } {
  return {
    ...r,
    term_start: day(r.term_start),
    term_end: day(r.term_end),
    hoa_member: idOf(r.hoa_member),
    member_name: fullName(r.hoa_member),
    organization: idOf(r.hoa_member?.organization),
  };
}

// ── Loads (each 404s on another community's row) ────────────────────────────

const notFound = (what: string) => createError({ statusCode: 404, message: `${what} not found` });

export async function loadJob(orgId: string, id: string): Promise<StoredResponsibility> {
  const rows = await getTypedDirectus().request(
    readItems("hoa_responsibilities" as any, {
      filter: { id: { _eq: id }, organization: { _eq: orgId } },
      fields: [...RESPONSIBILITY_FIELDS] as any,
      limit: 1,
    })
  );
  const row = (rows as any[])?.[0];
  if (!row) throw notFound("Job");
  return normaliseJob(row);
}

export async function loadJobs(orgId: string): Promise<StoredResponsibility[]> {
  const rows = await getTypedDirectus().request(
    readItems("hoa_responsibilities" as any, {
      filter: { organization: { _eq: orgId } },
      fields: [...RESPONSIBILITY_FIELDS] as any,
      sort: ["sort", "title"] as any,
      limit: -1,
    })
  );
  return ((rows as any[]) ?? []).map(normaliseJob);
}

export async function loadAssignee(orgId: string, id: string): Promise<StoredAssignee> {
  const rows = await getTypedDirectus().request(
    readItems("hoa_responsibility_assignees" as any, {
      filter: { id: { _eq: id }, organization: { _eq: orgId } },
      fields: [...ASSIGNEE_FIELDS] as any,
      limit: 1,
    })
  );
  const row = (rows as any[])?.[0];
  if (!row) throw notFound("Holder");
  return normaliseAssignee(row);
}

/** Every assignee row of the community, or of one job. */
export async function loadAssignees(orgId: string, jobId?: string): Promise<StoredAssignee[]> {
  const filter: Record<string, unknown> = { organization: { _eq: orgId } };
  if (jobId) filter.responsibility = { _eq: jobId };
  const rows = await getTypedDirectus().request(
    readItems("hoa_responsibility_assignees" as any, {
      filter: filter as any,
      fields: [...ASSIGNEE_FIELDS] as any,
      sort: ["start_date"] as any,
      limit: -1,
    })
  );
  return ((rows as any[]) ?? []).map(normaliseAssignee);
}

/** The community's board terms (any status), with the member's live name. */
export async function loadBoardTerms(orgId: string): Promise<ReturnType<typeof normaliseTerm>[]> {
  const rows = await getTypedDirectus().request(
    readItems("hoa_board_members", {
      filter: { hoa_member: { organization: { _eq: orgId } } } as any,
      fields: [...TERM_FIELDS] as any,
      sort: ["term_start"] as any,
      limit: -1,
    })
  );
  return ((rows as any[]) ?? []).map(normaliseTerm);
}

/** One board term, 404 unless its member belongs to `orgId`. */
export async function loadBoardTerm(orgId: string, id: string): Promise<ReturnType<typeof normaliseTerm>> {
  const row = await getTypedDirectus()
    .request(readItem("hoa_board_members", id, { fields: [...TERM_FIELDS] as any }))
    .catch(() => null);
  const term = row ? normaliseTerm(row) : null;
  if (!term || term.organization !== orgId) throw notFound("Board term");
  return term;
}

// ── Names ────────────────────────────────────────────────────────────────────

/** Display names for every target the rows name, read only from this community. */
export async function loadNames(orgId: string, rows: readonly StoredAssignee[]): Promise<NameBook> {
  const names = emptyNames();
  const ids = (k: "member" | "user" | "vendor" | "team") => [...new Set(rows.map((r) => idOf(r[k])).filter((x): x is string => !!x))];
  const d = getTypedDirectus();
  const members = ids("member");
  const users = ids("user");
  const vendors = ids("vendor");
  const teams = ids("team");
  await Promise.all([
    members.length &&
      d
        .request(readItems("hoa_members", { filter: { id: { _in: members }, organization: { _eq: orgId } }, fields: ["id", "first_name", "last_name", "user.avatar"] as any, limit: -1 }))
        .then((rs: any[]) => rs.forEach((r) => (names.members[r.id] = { name: fullName(r) ?? "Member", avatar: idOf(r.user?.avatar) }))),
    users.length &&
      d
        .request(readUsers({ filter: { id: { _in: users } }, fields: ["id", "first_name", "last_name", "email", "avatar"], limit: -1 } as any))
        .then((rs: any[]) => rs.forEach((r) => (names.users[r.id] = { name: fullName(r) ?? r.email ?? "User", avatar: idOf(r.avatar) }))),
    vendors.length &&
      d
        .request(readItems("hoa_vendors", { filter: { id: { _in: vendors }, organization: { _eq: orgId } }, fields: ["id", "company", "name"], limit: -1 }))
        .then((rs: any[]) => rs.forEach((r) => (names.vendors[r.id] = { name: r.company || r.name || "Vendor" }))),
    teams.length &&
      d
        .request(readItems("hoa_teams", { filter: { id: { _in: teams }, organization: { _eq: orgId } }, fields: ["id", "name", "color"], limit: -1 }))
        .then((rs: any[]) => rs.forEach((r) => (names.teams[r.id] = { name: r.name || "Team", color: r.color ?? null }))),
  ]);
  return names;
}

/** The name an ending row freezes. */
export async function nameToFreeze(orgId: string, row: StoredAssignee): Promise<string> {
  const t = targetOf(row);
  if (!t) return row.holder_name || "Unknown";
  if (t.kind === "office" || t.kind === "label") return liveName(t.kind, t.value, emptyNames());
  return liveName(t.kind, t.value, await loadNames(orgId, [row]));
}

// ── Scope checks on what a body names ───────────────────────────────────────

const refuse = (message: string) => createError({ statusCode: 400, message });

/** 400 unless the target's record belongs to this community. Offices and labels always do. */
export async function assertTargetInOrg(orgId: string, t: Target): Promise<void> {
  const d = getTypedDirectus();
  const one = async (collection: string, filter: Record<string, unknown>) =>
    ((await d.request(readItems(collection as any, { filter: filter as any, fields: ["id"] as any, limit: 1 }))) as any[])?.length > 0;
  switch (t.kind) {
    case "member":
      if (!(await one("hoa_members", { id: { _eq: t.value }, organization: { _eq: orgId } }))) throw refuse("That member isn't in this community.");
      return;
    case "user":
      if (!(await one("hoa_members", { user: { _eq: t.value }, organization: { _eq: orgId }, status: { _in: ["active", "pending"] } })))
        throw refuse("That person isn't a member of this community.");
      return;
    case "vendor":
      if (!(await one("hoa_vendors", { id: { _eq: t.value }, organization: { _eq: orgId } }))) throw refuse("That vendor isn't in this community.");
      return;
    case "team":
      if (!(await one("hoa_teams", { id: { _eq: t.value }, organization: { _eq: orgId } }))) throw refuse("That team isn't in this community.");
      return;
    default:
      return;
  }
}

export async function assertProjectInOrg(orgId: string, projectId: string | null | undefined): Promise<void> {
  if (!projectId) return;
  const rows = (await getTypedDirectus().request(
    readItems("hoa_projects", { filter: { id: { _eq: projectId }, organization: { _eq: orgId } }, fields: ["id"], limit: 1 })
  )) as any[];
  if (!rows?.length) throw refuse("That project isn't in this community.");
}

export async function assertEvidenceInOrg(orgId: string, fileIds: readonly string[] | null | undefined): Promise<void> {
  if (!fileIds?.length) return;
  const refused = await filesOutsideOrg(orgId, [...fileIds]);
  if (refused.length) {
    throw createError({ statusCode: 403, message: "A file isn't in this community's library.", data: { code: "file_outside_org" } });
  }
}

export function assertArea(area: string | null | undefined): void {
  if (area != null && area !== "" && !isAreaKey(area)) throw refuse(`"${area}" is not an area.`);
}

// ── Activity ─────────────────────────────────────────────────────────────────

export interface ActivityEntry {
  type: "responsibility" | "board_term";
  collection: string;
  id: string;
  label: string;
  metadata?: Record<string, unknown>;
}

/**
 * One `hoa_activity` row with the actor, from the session — never the body.
 * Awaited, and never fails the write it records: a lost log line is better
 * than a hand-over that half happened.
 */
export async function logRegisterActivity(event: H3Event, access: Pick<ResponsibilityAccess, "orgId" | "userId" | "memberId">, entry: ActivityEntry): Promise<void> {
  try {
    await getTypedDirectus().request(
      createItem("hoa_activity", {
        organization: access.orgId,
        member: access.memberId,
        user: access.userId,
        event_type: entry.type,
        target_collection: entry.collection,
        target_id: entry.id,
        label: entry.label.slice(0, 255),
        metadata: entry.metadata ?? null,
        ip: getRequestIP(event, { xForwardedFor: true }) || null,
        user_agent: getHeader(event, "user-agent") || null,
      } as any)
    );
  } catch (e) {
    console.error("[responsibilities] activity write failed:", e);
  }
}

/** Parse a zod body or 400 with its first message. */
export async function readBodyWith<T>(event: H3Event, schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }): Promise<T> {
  const parsed = schema.safeParse(await readBody(event).catch(() => null));
  if (parsed.success === false) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the form." });
  return parsed.data;
}

// ── Community and extras ────────────────────────────────────────────────────

export interface OrgSwitches {
  name: string | null;
  published: boolean;
  showUnassigned: boolean;
  /** The module toggle; a missing key reads as on. */
  moduleOn: boolean;
}

export async function loadOrgSwitches(orgId: string): Promise<OrgSwitches> {
  const org = (await getTypedDirectus()
    .request(
      readItem("hoa_organizations", orgId, {
        fields: ["id", "name", "modules", "responsibilities_published", "responsibilities_show_unassigned"] as any,
      })
    )
    .catch(() => null)) as any;
  if (!org) throw createError({ statusCode: 404, message: "Community not found" });
  const modules = org.modules && typeof org.modules === "object" ? org.modules : {};
  return {
    name: org.name ?? null,
    published: org.responsibilities_published === true,
    showUnassigned: org.responsibilities_show_unassigned === true,
    moduleOn: modules.responsibilities !== false,
  };
}

/** Names for last_verified_by, project titles and evidence files, for the editors' view. */
export async function loadRegisterExtras(orgId: string, jobs: readonly StoredResponsibility[]): Promise<RegisterExtras> {
  const d = getTypedDirectus();
  const userIds = [...new Set(jobs.map((j) => j.last_verified_by).filter((x): x is string => !!x))];
  const projectIds = [...new Set(jobs.map((j) => j.project).filter((x): x is string => !!x))];
  const jobIds = jobs.map((j) => j.id);
  const extras: Required<RegisterExtras> = { users: {}, projects: {}, evidence: {} };
  await Promise.all([
    userIds.length &&
      d
        .request(readUsers({ filter: { id: { _in: userIds } }, fields: ["id", "first_name", "last_name", "email"], limit: -1 } as any))
        .then((rs: any[]) => rs.forEach((r) => (extras.users[r.id] = { name: fullName(r) ?? r.email ?? "User" }))),
    projectIds.length &&
      d
        .request(readItems("hoa_projects", { filter: { id: { _in: projectIds }, organization: { _eq: orgId } }, fields: ["id", "title"], limit: -1 }))
        .then((rs: any[]) => rs.forEach((r) => (extras.projects[r.id] = { title: r.title }))),
    jobIds.length &&
      d
        .request(
          readItems("hoa_responsibilities_files" as any, {
            filter: { hoa_responsibilities_id: { _in: jobIds } } as any,
            fields: ["id", "hoa_responsibilities_id", "directus_files_id.id", "directus_files_id.title", "directus_files_id.type"] as any,
            limit: -1,
          })
        )
        .then((rs: any[]) =>
          rs.forEach((r) => {
            const job = idOf(r.hoa_responsibilities_id);
            const f = r.directus_files_id;
            if (!job || !f) return;
            (extras.evidence[job] ??= []).push({ id: idOf(f)!, title: f.title ?? null, type: f.type ?? null });
          })
        ),
  ]);
  return extras;
}

/** Everything the editors' view and the PDF read, as of `asOf`. */
export async function loadRegister(orgId: string, asOf: string): Promise<RegisterRow[]> {
  const [jobs, assignees, terms] = await Promise.all([loadJobs(orgId), loadAssignees(orgId), loadBoardTerms(orgId)]);
  const [names, extras] = await Promise.all([loadNames(orgId, assignees), loadRegisterExtras(orgId, jobs)]);
  return registerRows(jobs, assignees, names, terms, asOf, todayUtc(), extras);
}

/** The route's `[id]` param, or 400. */
export function idParam(event: H3Event, name = "id"): string {
  const id = getRouterParam(event, name);
  if (!id) throw createError({ statusCode: 400, message: `${name} is required` });
  return id;
}

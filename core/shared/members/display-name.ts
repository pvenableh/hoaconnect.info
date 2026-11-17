/**
 * Which name of a person other people see (2026-11-17, Peter's call).
 *
 * A person has two names: the community's record (`hoa_members.first_name`,
 * `last_name`), which the admin keeps and a resident changes only through an
 * approved request; and their login's (`directus_users`), which they change
 * freely on /account. Wherever one person's name is shown to someone else, the
 * membership's name wins. The login's is a fallback for someone with no
 * membership in that community (a platform admin, a pending applicant), and
 * the person's own account page shows their login's.
 *
 * Pure: no Directus, no H3.
 */

export interface NameParts {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

/** "First Last", trimmed, or null when both are empty. */
export function fullName(p: NameParts | null | undefined): string | null {
  if (!p) return null;
  const n = [p.first_name, p.last_name].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  return n || null;
}

/** The name to show others: the membership's, else the login's, else `fallback`. */
export function displayName(
  member: NameParts | null | undefined,
  login: NameParts | null | undefined,
  fallback = "Member"
): string {
  return fullName(member) || fullName(login) || fallback;
}

/**
 * From a community's `hoa_members` rows, one name per login: an active row's
 * first, then any row with a name. Rows without a user or a name are skipped.
 */
export function namesByUser(
  rows: ReadonlyArray<NameParts & { user?: string | { id?: string | null } | null; status?: string | null }>
): Map<string, string> {
  const out = new Map<string, string>();
  const ranked = [...rows].sort((a, b) => Number(b.status === "active") - Number(a.status === "active"));
  for (const r of ranked) {
    const uid = typeof r.user === "string" ? r.user : r.user?.id ?? null;
    const name = fullName(r);
    if (uid && name && !out.has(uid)) out.set(uid, name);
  }
  return out;
}

/** Like `namesByUser`, keeping the parts (for initials and sorting). */
export function partsByUser(
  rows: ReadonlyArray<NameParts & { user?: string | { id?: string | null } | null; status?: string | null }>
): Map<string, { first_name: string | null; last_name: string | null }> {
  const out = new Map<string, { first_name: string | null; last_name: string | null }>();
  const ranked = [...rows].sort((a, b) => Number(b.status === "active") - Number(a.status === "active"));
  for (const r of ranked) {
    const uid = typeof r.user === "string" ? r.user : r.user?.id ?? null;
    if (!uid || !fullName(r) || out.has(uid)) continue;
    out.set(uid, { first_name: r.first_name?.trim() || null, last_name: r.last_name?.trim() || null });
  }
  return out;
}

/**
 * Put the membership's name into a login object's own `first_name` and
 * `last_name`, so a route can keep its response shape. Leaves the object as it
 * is when the person has no membership name here. Returns a copy.
 */
export function withMemberName<T extends (NameParts & { id?: string | null }) | null | undefined>(
  login: T,
  parts: Map<string, { first_name: string | null; last_name: string | null }>
): T {
  if (!login || typeof login !== "object" || !login.id) return login;
  const p = parts.get(login.id);
  return p ? ({ ...login, first_name: p.first_name, last_name: p.last_name } as T) : login;
}

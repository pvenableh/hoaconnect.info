// Residency — is this person an OWNER or a TENANT of their unit?
//
// Kept as pure functions, in shared, for one reason: this value is written
// straight onto `hoa_members.member_type`, and that field decides who appears
// in owner-only audiences and who receives certain mail. A wrong value here is
// a wrong recipient list, so the mapping is worth testing rather than
// re-deriving inline in each endpoint.
//
// History worth knowing: `InviteMemberForm.vue` has always collected this and
// always POSTed it as `personType`, but `invite-member.post.ts` never read it
// and `accept-invitation.post.ts` hardcoded every new member to "owner". The
// admin's answer was discarded, not missing. 1033 Lenox has 22 tenants that
// path would each have recorded as owners.

export type Residency = "owner" | "tenant";

/**
 * Normalize a residency supplied when inviting someone.
 *
 * Returns null for "not specified" — which includes `property_manager`, one of
 * the invite form's three "Type" options. A manager is neither owner nor tenant
 * of the unit; that distinction is carried by the Property Manager ROLE, not by
 * residency.
 *
 * Anything else unrecognized also returns null, so a junk value can never reach
 * the roster; callers that want to reject it should compare against the input.
 */
export function normalizeResidency(input: unknown): Residency | null {
  return input === "owner" || input === "tenant" ? input : null;
}

/** Is this a value we deliberately accept as "unspecified" rather than a typo? */
export function isKnownNonResidency(input: unknown): boolean {
  return input == null || input === "" || input === "property_manager";
}

/**
 * The residency to record on a member when an invitation is accepted.
 *
 * Falls back to "owner" when the invitation carries nothing — which is every
 * invitation created before `hoa_invitations.member_type` existed, and is
 * exactly what this code did unconditionally before. The fallback is therefore
 * a compatibility floor, not a guess we are newly introducing.
 */
export function residencyOnAccept(invitationMemberType: unknown): Residency {
  return normalizeResidency(invitationMemberType) ?? "owner";
}

// ── Phase 2: residency resolved from the unit link, member_type as fallback ──

/**
 * The shape `residencyFor` needs off a `hoa_member_units` row. Deliberately
 * structural rather than the generated `HoaMemberUnit`: callers fetch a narrow
 * `fields` list, and requiring the full row would push them into casts.
 */
export interface UnitLinkResidency {
  member_type?: unknown;
  is_primary_unit?: boolean | null;
  end_date?: string | null;
}

/** The shape `residencyFor` needs off a `hoa_members` row. */
export interface MemberResidency {
  member_type?: unknown;
  /** The `hoa_member_units` alias on `hoa_members`. String ids are ignored. */
  units?: Array<UnitLinkResidency | string> | null;
}

/** Where a resolved residency actually came from. Drives the Phase 3 UI. */
export type ResidencySource = "unit_link" | "member_fallback" | "none";

export interface ResolvedResidency {
  residency: Residency | null;
  source: ResidencySource;
}

/**
 * Is this unit link a CURRENT occupancy as of `asOf`?
 *
 * Only `end_date` is consulted, not `start_date`: a link created ahead of a
 * move-in is still the residency an admin just recorded, and treating a future
 * start as "not yet a resident" would make a freshly assigned unit resolve to
 * nothing. `end_date` is the one that means "this is over".
 *
 * ⚠️ `status` is deliberately NOT consulted. On production 79 of 81 links are
 * `draft` (that is what `scripts/migrate-1033.ts` wrote) and only 2 are
 * `published` (written by `member-units/assign.post.ts`). No existing reader of
 * this collection filters on it either. Filtering here would ignore 97% of the
 * real links and silently fall back to `member_type` for all of 1033 Lenox.
 */
function isCurrentLink(link: UnitLinkResidency, asOf: Date): boolean {
  if (!link.end_date) return true;
  const end = new Date(link.end_date);
  if (Number.isNaN(end.getTime())) return true; // unparseable → don't discard a real link
  return end.getTime() >= asOf.getTime();
}

/**
 * Resolve a member's residency: the unit link FIRST, `hoa_members.member_type`
 * as the fallback.
 *
 * ⚠️ The fallback is required, not optional. 605 Lincoln Road is live in
 * production with 33 active members and ZERO unit links, and both demo orgs
 * have none. Junction-only resolution would blank residency for 40+ real
 * members — several of whom are on mail audiences decided by this value.
 *
 * This is a transition mechanism with a visible end state: Phase 3's
 * unlinked-member alert drives the gap to zero, at which point the fallback
 * stops firing on its own. It is not a permanent dual source of truth.
 *
 * Among several current links, a primary one wins; otherwise the first link
 * that carries a residency at all does. Junk values are normalized away, so a
 * link written straight into Directus with `member_type: "garbage"` falls
 * through to the member rather than poisoning an audience — Directus does not
 * enforce `choices`, so that is a real path, not a hypothetical.
 */
export function resolveResidency(
  member: MemberResidency | null | undefined,
  options?: { asOf?: Date }
): ResolvedResidency {
  const asOf = options?.asOf ?? new Date();

  const links = Array.isArray(member?.units) ? member.units : [];
  const candidates = links.filter(
    (l): l is UnitLinkResidency =>
      !!l && typeof l === "object" && normalizeResidency(l.member_type) !== null && isCurrentLink(l, asOf)
  );

  const chosen = candidates.find((l) => l.is_primary_unit === true) ?? candidates[0];
  if (chosen) {
    return { residency: normalizeResidency(chosen.member_type), source: "unit_link" };
  }

  const fallback = normalizeResidency(member?.member_type);
  return fallback
    ? { residency: fallback, source: "member_fallback" }
    : { residency: null, source: "none" };
}

/** `resolveResidency`, when the caller only needs the value. */
export function residencyFor(
  member: MemberResidency | null | undefined,
  options?: { asOf?: Date }
): Residency | null {
  return resolveResidency(member, options).residency;
}

/**
 * The `fields` a Directus read needs for `residencyFor` to see unit links.
 * Spread into an existing `fields` array so a call site cannot half-migrate —
 * asking for residency while forgetting `end_date` would make an ended
 * occupancy decide a current audience.
 */
export const RESIDENCY_UNIT_FIELDS = [
  "units.member_type",
  "units.is_primary_unit",
  "units.end_date",
] as const;

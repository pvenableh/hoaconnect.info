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

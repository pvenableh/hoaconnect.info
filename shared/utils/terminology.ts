/**
 * Org-type terminology (shared, pure).
 *
 * A community is residential or commercial (hoa_organizations.type). The public
 * landing adapts its wording accordingly: residential talks about "Residents"
 * and "Households"; commercial talks about "Members". Unset defaults to the
 * residential wording (the common HOA case), so existing orgs read unchanged.
 *
 * Lives in shared/utils so it auto-imports in both the app and the Nitro server.
 */

export type OrgType = "residential" | "commercial" | null | undefined;

export interface TermPair {
  singular: string;
  plural: string;
}

/** The word for a person who belongs to the community (CTAs, prompts). */
export function orgMemberNoun(type: OrgType): TermPair {
  switch (type) {
    case "commercial":
      return { singular: "Member", plural: "Members" };
    case "residential":
    default:
      return { singular: "Resident", plural: "Residents" };
  }
}

/** The unit shown by the "community size" widget (count of members). */
export function orgMemberLabel(type: OrgType): TermPair {
  switch (type) {
    case "commercial":
      return { singular: "Member", plural: "Members" };
    case "residential":
    default:
      return { singular: "Household", plural: "Households" };
  }
}

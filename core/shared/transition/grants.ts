/**
 * Property-manager grant presets — what a manager is allowed to do, as data.
 *
 * The grant flags themselves already existed (`hoa_members.manager_permissions`,
 * enforced server-side in `core/server/utils/manager-access.ts`). What did not
 * exist is a *named* shape for them, so every onboarding was an admin ticking
 * seven checkboxes from memory and every offboarding was hoping they remembered
 * to untick all seven.
 *
 * VISION Pillar A calls for a **Full-service preset** specifically: the answer to
 * "we don't want to self-manage, can the PM just run everything?" has to be one
 * click, because the alternative — a community that hands over the admin account
 * itself — is the lock-in we exist to prevent. Full service is a grant bundle,
 * never a transfer of ownership.
 *
 * The key list lives here rather than in the server util because both sides need
 * it and a drifted copy is the kind of bug that silently under-revokes: a key the
 * revoker doesn't know about stays true after a manager leaves.
 *
 * Pure: no Directus, no H3.
 */

/**
 * Every grant a Property Manager can hold. Adding one here is the only place it
 * needs adding — `manager-access.ts` imports this type, the presets below are
 * checked for completeness in the test suite, and revocation walks the same list.
 */
export const MANAGER_GRANT_KEYS = [
  "inquiries",
  "violations",
  "directory",
  "documents",
  "communications",
  "projects",
  "activity",
] as const;

export type ManagerGrantKey = (typeof MANAGER_GRANT_KEYS)[number];

export type ManagerGrants = Readonly<Record<ManagerGrantKey, boolean>>;

export interface GrantPreset {
  readonly key: string;
  readonly label: string;
  /** Shown under the label when an admin picks a preset. Plain English. */
  readonly description: string;
  readonly grants: ManagerGrants;
}

function build(on: readonly ManagerGrantKey[]): ManagerGrants {
  return Object.fromEntries(
    MANAGER_GRANT_KEYS.map((k) => [k, on.includes(k)])
  ) as ManagerGrants;
}

/** Every flag off. What revocation writes — never `null`, so the shape survives. */
export const NO_GRANTS: ManagerGrants = build([]);

/**
 * Presets, narrowest first. Deliberately few: an admin choosing between three
 * named arrangements makes a better decision than one facing seven checkboxes,
 * and the custom case is always still available.
 */
export const GRANT_PRESETS: readonly GrantPreset[] = [
  {
    key: "inquiries_only",
    label: "Inquiries only",
    description:
      "Answers resident questions and nothing else. A good default for a manager you have just hired, or one who handles a single building among many.",
    grants: build(["inquiries"]),
  },
  {
    key: "standard",
    label: "Day-to-day management",
    description:
      "Handles inquiries, violations, the resident directory and documents. The board keeps communications, projects and reporting.",
    grants: build(["inquiries", "violations", "directory", "documents"]),
  },
  {
    key: "full_service",
    label: "Full service",
    description:
      "Runs the community day-to-day: everything above plus sending communications, managing projects and seeing portal activity. The board still owns the account, the data and the audit trail — full service is a set of permissions, never a handover.",
    grants: build([...MANAGER_GRANT_KEYS]),
  },
];

export function presetFor(key: string | null | undefined): GrantPreset | undefined {
  return GRANT_PRESETS.find((p) => p.key === key);
}

/** Normalize whatever is stored on the row into a complete, boolean-valued set. */
export function normalizeGrants(
  stored: Record<string, unknown> | null | undefined
): ManagerGrants {
  return Object.fromEntries(
    MANAGER_GRANT_KEYS.map((k) => [k, stored?.[k] === true])
  ) as ManagerGrants;
}

/**
 * Which preset a stored grant set corresponds to, or null for a custom mix.
 * Lets the UI show "Full service" instead of seven ticked boxes, without
 * storing the preset name and letting the two drift.
 */
export function matchPreset(
  stored: Record<string, unknown> | null | undefined
): GrantPreset | null {
  const grants = normalizeGrants(stored);
  return (
    GRANT_PRESETS.find((p) =>
      MANAGER_GRANT_KEYS.every((k) => p.grants[k] === grants[k])
    ) ?? null
  );
}

/** True when at least one grant is held — i.e. there is something to revoke. */
export function hasAnyGrant(
  stored: Record<string, unknown> | null | undefined
): boolean {
  const grants = normalizeGrants(stored);
  return MANAGER_GRANT_KEYS.some((k) => grants[k]);
}

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
 * Every AREA of a community a manager can be given — the one list, for server
 * and client (docs/spec-role-context.md). Each manager membership carries two
 * switches per area: "can work on it" (the grant) and "is notified about it"
 * (the responsibility). Adding an area here is the only place it needs adding.
 *
 * `label` is the short noun the area goes by in a sentence. The settings screen
 * phrases grants as actions ("Send communications") because it is describing a
 * switch; a ledger entry needs the noun — "added Communications, removed
 * Projects" — and a permanent record should not carry the UI's phrasing of the
 * day.
 *
 * `gate` is the file that enforces "can work on it" — a test checks the file
 * exists and names the key. An area with no gate (`null`) cannot be granted:
 * it is not in `MANAGER_GRANT_KEYS`, not in a preset, not a settings switch,
 * and only an admin can work on it. It can still be notified. It becomes
 * grantable in the same change that gives it a gate, never before — a switch
 * with nothing behind it tells an admin they delegated something they did not.
 *
 * `feedback` covers polls: seeing them, their live tallies, and closing them.
 * It is deliberately NOT part of `communications`, so an admin can let a manager
 * see what residents think without also letting them email every resident — the
 * two are adjacent but a board may well want one and not the other. It covers
 * closing as well as reading for the same reason `documents` covers publishing
 * as well as viewing: an area names a responsibility, not a verb.
 */
export const AREAS = [
  { key: "inquiries", label: "Inquiries", gate: "core/server/utils/area-requests.ts" },
  { key: "violations", label: "Violations", gate: "app/pages/[slug]/manage/inquiries/index.vue" },
  { key: "directory", label: "Directory", gate: "core/server/utils/change-request-access.ts" },
  { key: "documents", label: "Documents", gate: "core/server/utils/governing-access.ts" },
  { key: "communications", label: "Communications", gate: "core/server/api/email/send.post.ts" },
  { key: "feedback", label: "Community feedback", gate: "core/server/utils/poll-access.ts" },
  { key: "projects", label: "Projects", gate: "core/server/utils/project-access.ts" },
  { key: "activity", label: "Activity", gate: "core/server/api/org/activity.get.ts" },
  // Phase 3 support: may open "Contact HOA Connect" requests for the community.
  { key: "contact_platform", label: "Contact HOA Connect", gate: "core/shared/support/access.ts" },
  // Edit the register of who does each standing job (plan §3.4). The board
  // reads it by its seat, not by this grant; publishing it stays with admins.
  { key: "responsibilities", label: "Responsibilities register", gate: "core/server/utils/responsibility-access.ts" },
  // Notify-only until their pages and routes exist (plan §3.1, §3.2).
  { key: "vendors", label: "Vendors and contracts", gate: null },
  { key: "billing", label: "Invoices and payments", gate: null },
] as const;

export type AreaKey = (typeof AREAS)[number]["key"];

export const AREA_KEYS: readonly AreaKey[] = AREAS.map((a) => a.key);

type GrantableArea = Extract<(typeof AREAS)[number], { gate: string }>;

/**
 * Every grant a Property Manager can hold: the areas with a gate, in list
 * order. `manager-access.ts` imports this type, the presets below are checked
 * for completeness in the test suite, and revocation walks the same list.
 *
 * Every key defaults to FALSE through `normalizeGrants`, so adding one never
 * widens an existing manager's access — an admin has to turn it on.
 */
export const MANAGER_GRANT_KEYS: readonly GrantableArea["key"][] = AREAS.filter(
  (a): a is GrantableArea => a.gate !== null
).map((a) => a.key);

export type ManagerGrantKey = GrantableArea["key"];

export type ManagerGrants = Readonly<Record<ManagerGrantKey, boolean>>;

/** The short noun for each grant, from the area list. */
export const MANAGER_GRANT_LABELS: Readonly<Record<ManagerGrantKey, string>> = Object.fromEntries(
  AREAS.filter((a): a is GrantableArea => a.gate !== null).map((a) => [a.key, a.label])
) as Record<ManagerGrantKey, string>;

/** The short noun for any area (grantable or not); the key itself if unknown. */
export function areaLabel(key: string): string {
  return AREAS.find((a) => a.key === key)?.label ?? key;
}

export function isAreaKey(key: unknown): key is AreaKey {
  return typeof key === "string" && (AREA_KEYS as readonly string[]).includes(key);
}

export function grantLabel(key: string): string {
  return MANAGER_GRANT_LABELS[key as ManagerGrantKey] ?? key;
}

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
      "Runs the community day-to-day: everything above plus sending communications, managing projects, seeing portal activity and keeping the responsibilities register. The board still owns the account, the data and the audit trail — full service is a set of permissions, never a handover.",
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

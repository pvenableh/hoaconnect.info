/**
 * Entry builders — the pure half of every ledger writer.
 *
 * A writer is two things: a server route that changes something, and a function
 * here that says what happened. Keeping the second half pure is what makes the
 * sentence a community reads in five years testable today, and it is the reason
 * Phase 4's transition entry could be verified before anything was written to a
 * database.
 *
 * The discipline every builder follows, taken from `buildTransitionAuditEntry`:
 *
 * - **Take the decision, not the database rows.** A builder describes what was
 *   decided, so the entry cannot drift from the change that was actually made.
 * - **Name people.** "Access changed for 3 managers" is useless to the board
 *   reading it two years later, and this is the permanent copy.
 * - **Take visibility from the catalogue**, never a literal. `./events` decides
 *   who may see an event type; a builder that hardcodes a string is the drift
 *   the policy module exists to prevent.
 * - **Take `occurredAt` as an argument.** No clock in here.
 *
 * `buildTransitionAuditEntry` lives in `core/shared/transition/audit.ts` rather
 * than here: it needs the whole `TransitionPlan`, and moving it would drag the
 * planner's types into every ledger consumer. It follows the same rules.
 */

import type { LedgerActor, LedgerEntry } from "./entry";
import { LEDGER_SCHEMA_VERSION } from "./entry";
import { defaultVisibilityFor } from "./events";
import {
  MANAGER_GRANT_KEYS,
  grantLabel,
  matchPreset,
  normalizeGrants,
  type ManagerGrantKey,
} from "#core/shared/transition/grants";


export interface GrantChangeSubject {
  readonly memberId: string;
  /** The manager's name as it should read forever, even after the account goes. */
  readonly name: string;
  readonly email: string | null;
}

export interface GrantDiff {
  readonly added: readonly ManagerGrantKey[];
  readonly removed: readonly ManagerGrantKey[];
}

/**
 * What actually changed between two grant sets, in the canonical key order.
 *
 * Both sides run through `normalizeGrants` first, because stored grants are not
 * trustworthy as a shape: `hoa_members.manager_permissions` has a stale Directus
 * default of five keys predating `projects` and `activity`, so a row can come
 * back missing keys entirely. Comparing raw objects would report a permission as
 * "removed" when it was only ever absent.
 */
export function diffGrants(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): GrantDiff {
  const a = normalizeGrants(before);
  const b = normalizeGrants(after);
  return {
    added: MANAGER_GRANT_KEYS.filter((k) => !a[k] && b[k]),
    removed: MANAGER_GRANT_KEYS.filter((k) => a[k] && !b[k]),
  };
}

/** True when nothing moved — the caller should write no entry at all. */
export function isNoOpGrantChange(diff: GrantDiff): boolean {
  return diff.added.length === 0 && diff.removed.length === 0;
}

function list(keys: readonly ManagerGrantKey[]): string {
  const labels = keys.map(grantLabel);
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * The entry for a manager's permissions changing.
 *
 * Owner-visible, because VISION names grant changes among the things owners are
 * entitled to see: who is allowed to act for a community, and on whose
 * authority. The entry records WHICH permissions moved and who moved them —
 * never why, which is deliberation and belongs nowhere near this table.
 *
 * Returns `null` when nothing changed. A ledger that fills up with "no change"
 * rows is a ledger nobody reads, and an admin who toggles a switch twice has
 * done nothing to the community.
 */
export function buildGrantChangeEntry(input: {
  readonly organizationId: string;
  readonly organizationName: string | null;
  readonly manager: GrantChangeSubject;
  readonly before: Record<string, unknown> | null | undefined;
  readonly after: Record<string, unknown> | null | undefined;
  readonly actor: LedgerActor;
  readonly occurredAt: string;
  /** The preset the admin picked, when they picked one rather than a single switch. */
  readonly presetKey?: string | null;
}): LedgerEntry | null {
  const diff = diffGrants(input.before, input.after);
  if (isNoOpGrantChange(diff)) return null;

  const who = input.manager.name || input.manager.email || "A property manager";
  const parts: string[] = [];
  if (diff.added.length) parts.push(`gained ${list(diff.added)}`);
  if (diff.removed.length) parts.push(`lost ${list(diff.removed)}`);

  const after = normalizeGrants(input.after);
  const nothingLeft = MANAGER_GRANT_KEYS.every((k) => !after[k]);
  const preset = matchPreset(input.after);

  // The sentence a board reads. When every permission is gone, say so plainly
  // rather than listing seven removals — "has no permissions left" is the fact
  // that matters, and it is the one an offboarding is checked against.
  const summary = nothingLeft
    ? `${who}'s management permissions were all removed.`
    : `${who} ${parts.join(" and ")}.`;

  return {
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type: "manager_grants_changed",
    occurred_at: input.occurredAt,
    actor_user: input.actor.userId,
    actor_name: input.actor.name,
    actor_email: input.actor.email,
    visibility: defaultVisibilityFor("manager_grants_changed"),
    summary,
    payload: {
      organization_name: input.organizationName,
      manager: {
        member_id: input.manager.memberId,
        name: input.manager.name || null,
        email: input.manager.email,
      },
      added: diff.added.map(grantLabel),
      removed: diff.removed.map(grantLabel),
      // The resulting arrangement, so a reader does not have to replay every
      // earlier entry to know what this manager could do afterwards.
      resulting_permissions: MANAGER_GRANT_KEYS.filter((k) => after[k]).map(grantLabel),
      preset: preset ? preset.label : null,
      preset_applied: input.presetKey ?? null,
    },
  };
}

/**
 * The audit entry a transition writes — and the first row shape of
 * `org_audit_log`, the append-only ledger VISION Pillar B is built on.
 *
 * It is defined here, in Phase 4, rather than waiting for the Community Ledger,
 * because a management transition is the single event a community most needs to
 * be able to prove years later ("who took our admin account away, and when?"),
 * and because building the ledger's writer once — with its immutability
 * guarantees established by a real caller — beats retrofitting one later around
 * a shape nobody exercised.
 *
 * Two properties this shape has to keep as Phase 5 adds writers:
 *
 * - **Append-only.** No update or delete permission for any role, ever
 *   (`no mutable audit log` is listed under What NOT to Build). Corrections are
 *   new entries, not edits.
 * - **Self-describing.** `summary` is the human sentence and `payload` is the
 *   machine record. A reader a year from now — or an incoming manager reading
 *   an export — must not need this codebase to understand the row.
 *
 * `visibility` is carried per-entry but decided by the caller. Phase 5 replaces
 * that with the central visibility-policy module; until then a transition is
 * owner-visible, which is the whole point of recording it.
 *
 * Pure: no Directus, no H3, no clock.
 */

import type { TransitionPlan } from "./plan";
import { TRANSITION_SCHEMA_VERSION } from "./plan";

export const AUDIT_SCHEMA_VERSION = TRANSITION_SCHEMA_VERSION;

/**
 * Event types the ledger understands. Phase 4 writes one of them; the union is
 * the extension point, and an unknown value read from an older row should be
 * rendered generically rather than dropped.
 */
export type AuditEventType =
  | "management_transition"
  | "manager_onboarded"
  | "admin_promoted";

/** Who may see an entry. Conservative by default — see the header. */
export type AuditVisibility = "owners" | "board";

export interface AuditActor {
  readonly userId: string | null;
  /** Denormalized on purpose: the row must still read correctly if the account is later deleted. */
  readonly name: string;
  readonly email: string | null;
}

export interface AuditEntry {
  readonly schema_version: number;
  readonly organization: string;
  readonly event_type: AuditEventType;
  readonly occurred_at: string;
  readonly actor_user: string | null;
  readonly actor_name: string;
  readonly actor_email: string | null;
  readonly visibility: AuditVisibility;
  /** One sentence, for a human reading the feed. */
  readonly summary: string;
  /** The structured record of what changed. */
  readonly payload: Record<string, unknown>;
}

/** "A and B", "A, B and C", "A, B, C and 2 others" — for a sentence, not a table. */
function listNames(names: readonly string[]): string {
  if (names.length <= 3) {
    return names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  const rest = names.length - 3;
  return `${names.slice(0, 3).join(", ")} and ${rest} other${rest === 1 ? "" : "s"}`;
}

/**
 * Turn an executed plan into the entry that records it.
 *
 * Takes the plan rather than the raw writes so the entry always describes what
 * was actually decided — including the steps, so a reader can see the ordering
 * that protected them, and the warnings, so a reader can see what the admin was
 * told at the time.
 */
export function buildTransitionAuditEntry(input: {
  readonly plan: TransitionPlan;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly actor: AuditActor;
  readonly occurredAt: string;
}): AuditEntry {
  const { plan, actor, occurredAt } = input;

  const outgoingNames = plan.outgoing.map((m) => m.name || m.email || m.id);
  const successorName = plan.successor
    ? plan.successor.name || plan.successor.email || plan.successor.id
    : null;

  const parts: string[] = [];
  if (outgoingNames.length === 1) {
    parts.push(`${outgoingNames[0]}'s management access ended`);
  } else if (outgoingNames.length > 1) {
    // Name them. A row that says "access ended for 3 people" is useless to the
    // board reading it two years later, and this is the permanent copy.
    parts.push(`Management access ended for ${listNames(outgoingNames)}`);
  }
  if (successorName) parts.push(`${successorName} became an administrator`);
  if (plan.graceEndsAt) {
    parts.push(`billing moved to the community with a grace period to ${plan.graceEndsAt.slice(0, 10)}`);
  }

  const summary = parts.length
    ? `${parts.join(", ")}.`
    : "A management transition was carried out.";

  return {
    schema_version: AUDIT_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type: "management_transition",
    occurred_at: occurredAt,
    actor_user: actor.userId,
    actor_name: actor.name,
    actor_email: actor.email,
    // A community's owners are entitled to know who runs their association.
    visibility: "owners",
    summary,
    payload: {
      organization_name: input.organizationName,
      successor: plan.successor
        ? { member_id: plan.successor.id, name: successorName }
        : null,
      outgoing: plan.outgoing.map((m) => ({
        member_id: m.id,
        name: m.name || null,
        email: m.email,
        had_grants: m.hasGrants,
      })),
      grace_ends_at: plan.graceEndsAt,
      steps: plan.steps.map((s) => ({
        kind: s.kind,
        label: s.label,
        targets: s.targetIds.length,
      })),
      warnings: plan.warnings.map((w) => w.code),
    },
  };
}

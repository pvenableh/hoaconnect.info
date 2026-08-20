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
 * `visibility` is carried per-entry. Phase 4 let this builder pick the string;
 * Phase 5 took that decision away and gave it to the event catalogue
 * (`core/shared/ledger/events.ts`), which is why the field below is a lookup
 * rather than a literal. A transition is still owner-visible — that is the whole
 * point of recording it — but the answer now comes from the same place every
 * other writer's does.
 *
 * Pure: no Directus, no H3, no clock.
 */

import type { TransitionPlan } from "./plan";
import { LEDGER_SCHEMA_VERSION } from "#core/shared/ledger/entry";
import { defaultVisibilityFor } from "#core/shared/ledger/events";

/**
 * Phase 5 moved these definitions into `core/shared/ledger/` — the row shape,
 * the visibility tiers and the event catalogue are now shared by six writers
 * and two readers, and could not keep living inside the transition module.
 * Re-exported here under their original names so Phase 4's callers are
 * unchanged; the ledger module is the source of truth.
 */
export type { LedgerVisibility as AuditVisibility } from "#core/shared/ledger/entry";
export type { LedgerActor as AuditActor } from "#core/shared/ledger/entry";
export type { LedgerEntry as AuditEntry } from "#core/shared/ledger/entry";
export type { LedgerEventType as AuditEventType } from "#core/shared/ledger/events";
import type { LedgerActor as AuditActor } from "#core/shared/ledger/entry";
import type { LedgerEntry as AuditEntry } from "#core/shared/ledger/entry";

export const AUDIT_SCHEMA_VERSION = LEDGER_SCHEMA_VERSION;

/** "A and B", "A, B and C", "A, B, C and 2 others" — for a sentence, not a table. */
function listNames(names: readonly string[]): string {
  if (names.length <= 3) {
    const [first] = names;
    if (names.length === 1) return first ?? "";
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
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
    schema_version: LEDGER_SCHEMA_VERSION,
    organization: input.organizationId,
    event_type: "management_transition",
    occurred_at: occurredAt,
    actor_user: actor.userId,
    actor_name: actor.name,
    actor_email: actor.email,
    // A community's owners are entitled to know who runs their association —
    // and from Phase 5 that judgement is the catalogue's to make, not this
    // builder's. See core/shared/ledger/events.ts.
    visibility: defaultVisibilityFor("management_transition"),
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

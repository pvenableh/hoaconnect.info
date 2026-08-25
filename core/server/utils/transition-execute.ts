/**
 * Carry out a transition plan, in the plan's order.
 *
 * Directus gives us no transaction across these writes, so a failure halfway
 * through is a real possibility and the design has to survive it. It does,
 * because of a property of the ordering that is worth stating plainly:
 *
 *   **every prefix of this sequence is a safe state.**
 *
 *   promote → revoke → deactivate → end-date → detach → grace → export → audit
 *
 * Stop after step 1 and the community has an extra administrator. Stop after
 * step 2 and the manager has lost their permissions but everything else stands.
 * At no point is there a state with nobody able to run the account — which is
 * exactly the state the old one-shot detach could produce, and could not
 * recover from. So on failure this reports what completed and stops; it does not
 * attempt to roll back, because rolling back means re-granting a manager access
 * the admin just asked to remove.
 */

import { createItem, readItems, updateItem } from "@directus/sdk";
import type { TransitionPlan, TransitionStep } from "#core/shared/transition/plan";
import { NO_GRANTS } from "#core/shared/transition/grants";
import { buildTransitionAuditEntry, type AuditActor } from "#core/shared/transition/audit";
import { EXPORT_TTL_DAYS } from "#core/shared/export/manifest";

export interface StepResult {
  readonly kind: TransitionStep["kind"];
  readonly label: string;
  readonly status: "done" | "skipped" | "failed";
  /** Why it was skipped, or what went wrong. */
  readonly note?: string;
}

export interface TransitionResult {
  readonly completed: boolean;
  readonly steps: readonly StepResult[];
  readonly auditEntryId: string | null;
  readonly exportId: string | null;
  readonly graceEndsAt: string | null;
}

/** Job states that mean an export is already being built for this org. */
const EXPORT_IN_FLIGHT = ["queued", "running"] as const;

export async function executeTransitionPlan(input: {
  readonly plan: TransitionPlan;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly hoaAdminRoleId: string;
  readonly billingAccountId: string | null;
  readonly actor: AuditActor;
  readonly now: string;
}): Promise<TransitionResult> {
  const { plan, organizationId, actor, now } = input;

  if (!plan.canExecute) {
    throw createError({
      statusCode: 409,
      statusMessage:
        plan.blockers[0]?.message ?? "This transition cannot be carried out yet.",
      data: { blockers: plan.blockers },
    });
  }

  const directus = getTypedDirectus();
  const results: StepResult[] = [];
  let auditEntryId: string | null = null;
  let exportId: string | null = null;

  for (const step of plan.steps) {
    try {
      switch (step.kind) {
        case "promote_admin": {
          const successorId = plan.successor?.id;
          if (!successorId) {
            results.push({ ...base(step), status: "skipped", note: "No successor named." });
            break;
          }
          // Org admin-ness lives on `hoa_members.role` — that is what
          // checkAdminAccess reads, and what the members UI writes. The
          // platform-level directus_users role is a separate concern and is
          // deliberately not touched here.
          await directus.request(
            updateItem("hoa_members", successorId, { role: input.hoaAdminRoleId } as any)
          );
          results.push({ ...base(step), status: "done" });
          break;
        }

        case "revoke_grants": {
          for (const memberId of step.targetIds) {
            // Written as a complete all-false set rather than null: a null
            // reads as "no answer" to anything that inspects a single flag.
            await directus.request(
              updateItem("hoa_members", memberId, { manager_permissions: NO_GRANTS } as any)
            );
          }
          results.push({ ...base(step), status: "done" });
          break;
        }

        case "deactivate_member": {
          for (const memberId of step.targetIds) {
            await directus.request(
              updateItem("hoa_members", memberId, { status: "inactive" } as any)
            );
          }
          results.push({ ...base(step), status: "done" });
          break;
        }

        case "end_vendor": {
          for (const vendorId of step.targetIds) {
            await directus.request(
              updateItem("hoa_vendors", vendorId, {
                active_until: now.slice(0, 10),
                status: "inactive",
              } as any)
            );
          }
          results.push({ ...base(step), status: "done" });
          break;
        }

        case "detach_billing": {
          await directus.request(
            updateItem("hoa_organizations", organizationId, {
              billing_account: null,
              subscription_status: "expired",
            } as any)
          );
          // The agency must stop paying for a property it no longer bills for.
          // The old detach route did this and dropping it would quietly
          // overcharge them — Stripe prorates the seat down.
          if (input.billingAccountId) {
            await syncBillingAccountSeats(input.billingAccountId);
          }
          results.push({ ...base(step), status: "done" });
          break;
        }

        case "open_grace": {
          await directus.request(
            updateItem("hoa_organizations", organizationId, {
              grace_ends_at: plan.graceEndsAt,
            } as any)
          );
          results.push({ ...base(step), status: "done" });
          break;
        }

        case "offer_export": {
          // Respect the one-at-a-time rule the export queue enforces, rather
          // than reaching around it: a second archive for the same org would
          // duplicate hundreds of megabytes of work for an identical result.
          const inFlight = (await directus.request(
            readItems("hoa_data_exports", {
              filter: {
                organization: { _eq: organizationId },
                status: { _in: [...EXPORT_IN_FLIGHT] },
              },
              fields: ["id"] as any,
              limit: 1,
            })
          )) as any[];

          if (inFlight?.length) {
            results.push({
              ...base(step),
              status: "skipped",
              note: "An export is already being prepared for this community.",
            });
            break;
          }

          const row = (await directus.request(
            createItem("hoa_data_exports", {
              organization: organizationId,
              requested_by: actor.userId,
              status: "queued",
              tier: "shareable",
              include_files: false,
              expires_at: new Date(
                new Date(now).getTime() + EXPORT_TTL_DAYS * 86_400_000
              ).toISOString(),
            } as any)
          )) as { id: string };
          exportId = row.id;
          await requestExportBuild(row.id);
          results.push({ ...base(step), status: "done" });
          break;
        }

        case "write_audit": {
          auditEntryId = await writeAuditEntry(
            buildTransitionAuditEntry({
              plan,
              organizationId,
              organizationName: input.organizationName,
              actor,
              occurredAt: now,
            })
          );
          results.push({ ...base(step), status: "done" });
          break;
        }
      }
    } catch (error: any) {
      // Stop here. Everything already written is a safe state (see the header);
      // continuing past a failure would write later steps on top of an unknown
      // one, and the audit entry would then describe work that did not happen.
      results.push({
        ...base(step),
        status: "failed",
        note: error?.message || "Unknown error",
      });
      return {
        completed: false,
        steps: results,
        auditEntryId,
        exportId,
        graceEndsAt: plan.graceEndsAt,
      };
    }
  }

  return {
    completed: true,
    steps: results,
    auditEntryId,
    exportId,
    graceEndsAt: plan.graceEndsAt,
  };
}

function base(step: TransitionStep): { kind: TransitionStep["kind"]; label: string } {
  return { kind: step.kind, label: step.label };
}

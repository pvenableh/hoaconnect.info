// Statute flags: the one write a manager makes to a flag, its status
// (spec §5 and §7). Confirm, dismiss, or mark confirmed by counsel; each change
// writes a row to the audit log with the status before and after.
//
// Nothing here reads or writes the text of a provision, or the wording of a
// flag (`document_rule`, `statute_rule`, the citation): only `status` and who
// confirmed it.
//
// Callers have already passed `requireGoverningManage`.

import { readItems, updateItem } from "@directus/sdk";
import type { H3Event } from "h3";
import { FLAG_STATUS_ACTIONS, SETTABLE_FLAG_STATUSES, type SettableFlagStatus } from "#core/shared/governing/flags";
import type { FlagStatus } from "#core/shared/governing/types";
import { governingActor, writeGoverningAudit } from "./governing-audit";

const FLAGS = "hoa_statute_flags";

export const isSettableFlagStatus = (v: unknown): v is SettableFlagStatus => (SETTABLE_FLAG_STATUSES as readonly unknown[]).includes(v);

/**
 * Set a flag's status. 404 unless the flag is this organization's; 409 when the
 * move is not one a flag in its current status can make. Setting the status it
 * already has changes nothing and writes no audit row.
 */
export async function setGoverningFlagStatus(
  event: H3Event,
  organizationId: string,
  flagId: string,
  status: SettableFlagStatus,
  reason: string | null
) {
  const directus = getTypedDirectus();
  const [flag] = ((await directus.request(
    readItems(FLAGS as never, {
      filter: { id: { _eq: flagId }, organization: { _eq: organizationId } },
      fields: ["id", "topic", "status", "confirmed_by", "confirmed_at"],
      limit: 1,
    } as never)
  )) ?? []) as any[];
  if (!flag) throw createError({ statusCode: 404, message: "Flag not found" });

  const from = (flag.status ?? "suggested") as FlagStatus;
  if (from === status) return { id: flag.id as string, status, changed: false };
  if (!FLAG_STATUS_ACTIONS[from]?.includes(status)) {
    throw createError({ statusCode: 409, message: "This flag cannot be moved to that status from where it is" });
  }

  const actor = await governingActor(event);
  const confirms = status !== "dismissed";
  const after = {
    status,
    confirmed_by: confirms ? actor.id : null,
    confirmed_at: confirms ? new Date().toISOString() : null,
  };
  await directus.request(updateItem(FLAGS as never, flag.id, after as never));

  await writeGoverningAudit(actor, {
    action: "flag_status",
    organization: organizationId,
    flag: flag.id,
    summary: `Statute flag "${flag.topic ?? flag.id}": ${from} → ${status}`,
    reason,
    before: {
      status: from,
      confirmed_by: typeof flag.confirmed_by === "string" ? flag.confirmed_by : (flag.confirmed_by?.id ?? null),
      confirmed_at: flag.confirmed_at ?? null,
    },
    after,
  });
  return { id: flag.id as string, status, changed: true };
}

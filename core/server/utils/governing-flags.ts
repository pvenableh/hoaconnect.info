// Statute flags: the one write a manager makes to a flag, its status
// (spec §5 and §7). Confirm, dismiss, or mark confirmed by counsel; each change
// writes a row to the audit log with the status before and after.
//
// A flag that is still a suggestion can also be edited (relationship,
// severity, the two rule lines, the note) before anyone confirms it: that is
// how a manager turns a software match into a comparison. Once confirmed, a
// flag's wording is fixed; dismiss it and start again instead.
//
// Nothing here reads or writes the text of a provision, a flag's citation or
// its quoted words.
//
// Callers have already passed `requireGoverningManage`.

import { readItems, updateItem } from "@directus/sdk";
import type { H3Event } from "h3";
import {
  FLAG_STATUS_ACTIONS,
  FLAG_TEXT_FIELDS,
  RELATIONSHIP_ORDER,
  SETTABLE_FLAG_STATUSES,
  SEVERITY_ORDER,
  type FlagEdit,
  type SettableFlagStatus,
} from "#core/shared/governing/flags";
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

  // A lawyer's sign-off is recorded with who gave it (Peter's deferred item, 2026-11-11).
  if (status === "counsel_confirmed" && !reason) {
    throw createError({ statusCode: 400, message: "Say who at counsel signed off, and when" });
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

/**
 * Edit a flag that is still a suggestion. 409 once it has been confirmed or
 * dismissed. Writes only the fields sent that differ, then one `flag_edit`
 * audit row with before and after; if that row cannot be written the fields
 * are put back.
 */
export async function editGoverningFlag(event: H3Event, organizationId: string, flagId: string, edit: FlagEdit) {
  const directus = getTypedDirectus();
  const [flag] = ((await directus.request(
    readItems(FLAGS as never, {
      filter: { id: { _eq: flagId }, organization: { _eq: organizationId } },
      fields: ["id", "topic", "status", "relationship", "severity", ...FLAG_TEXT_FIELDS],
      limit: 1,
    } as never)
  )) ?? []) as any[];
  if (!flag) throw createError({ statusCode: 404, message: "Flag not found" });
  if ((flag.status ?? "suggested") !== "suggested") {
    throw createError({ statusCode: 409, message: "Only a flag that is still a suggestion can be edited" });
  }

  const bad = (message: string) => createError({ statusCode: 400, message });
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const set = (field: string, value: unknown) => {
    const current = flag[field] ?? null;
    if (value === current) return;
    before[field] = current;
    after[field] = value;
  };
  if (edit.relationship !== undefined) {
    if (!(RELATIONSHIP_ORDER as string[]).includes(edit.relationship)) throw bad("Unknown relationship");
    set("relationship", edit.relationship);
  }
  if (edit.severity !== undefined) {
    if (!(SEVERITY_ORDER as string[]).includes(edit.severity)) throw bad("Unknown severity");
    set("severity", edit.severity);
  }
  for (const field of FLAG_TEXT_FIELDS) {
    const value = edit[field];
    if (value === undefined) continue;
    if (value !== null && typeof value !== "string") throw bad(`${field} must be text`);
    const text = (value ?? "").trim();
    if (text.length > 4000) throw bad(`${field} is too long`);
    set(field, text || null);
  }
  if (!Object.keys(after).length) return { id: flag.id as string, changed: false };

  const actor = await governingActor(event);
  await directus.request(updateItem(FLAGS as never, flag.id, after as never));
  try {
    await writeGoverningAudit(actor, {
      action: "flag_edit",
      organization: organizationId,
      flag: flag.id,
      summary: `Edited the suggested statute flag "${flag.topic ?? flag.id}"`,
      before,
      after,
    });
  } catch (error) {
    await directus.request(updateItem(FLAGS as never, flag.id, before as never)).catch(() => {});
    throw error;
  }
  return { id: flag.id as string, changed: true };
}

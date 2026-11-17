/**
 * Member self-service change-request helpers.
 *
 * Residents propose changes to their OWN household data; the change is stored as
 * a pending `hoa_member_change_requests` row and only applied to the live record
 * when an Admin / Property Manager approves. All field access is whitelisted
 * here so a resident can never smuggle in privileged fields (role, balance, the
 * owning org, another member's id, etc.). An owner's lease report (kind
 * `lease`) is checked and applied in lease-requests.ts.
 */
import { createItem, readItem, updateItem } from "@directus/sdk";
import { chooseRecordUnit } from "#core/shared/units/record-writes";
import { memberUnitsInOrg } from "#core/server/utils/unit-record-writes";
import { applyLeaseRequest, type LeaseApproval } from "#core/server/utils/lease-requests";

export const CHANGE_KINDS = ["name", "contact", "mailing_address", "vehicle", "pet", "lease"] as const;
export const CHANGE_ACTIONS = ["create", "update", "delete"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];
export type ChangeAction = (typeof CHANGE_ACTIONS)[number];

// kind → the collection the approved change writes to.
export const KIND_TARGET = {
  // The community's record of the name (hoa_members), which other members see.
  // The login's own name is the person's to change on /account.
  name: "hoa_members",
  contact: "hoa_members",
  mailing_address: "hoa_members",
  vehicle: "hoa_vehicles",
  pet: "hoa_pets",
  lease: "hoa_leases",
} as const satisfies Record<ChangeKind, string>;

// Whitelisted, resident-editable fields per kind.
const VEHICLE_FIELDS = ["make", "model", "year", "license_plate", "parking_spot", "image"];
const PET_FIELDS = ["name", "type", "breed", "weight", "image"];

const str = (v: unknown) => (typeof v === "string" ? v.trim() || null : v == null ? null : String(v));
/** A name part: trimmed, inner spaces collapsed, at most 100 characters, or null. */
const nameField = (v: unknown) => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 100) : "";
  return s || null;
};

function pick(payload: Record<string, any>, fields: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const f of fields) if (payload[f] !== undefined) out[f] = payload[f] === "" ? null : payload[f];
  return out;
}

function sanitizeMailing(v: any): Record<string, string | null> {
  const a = v && typeof v === "object" ? v : {};
  return {
    line1: str(a.line1),
    line2: str(a.line2),
    city: str(a.city),
    state: str(a.state),
    zip: str(a.zip),
  };
}

/**
 * Turn raw resident input into a SAFE change-request payload. Returns the
 * normalized { action, target_collection, target_id, payload } the server will
 * persist — derived from `kind`, never trusting client-supplied collection/ids
 * beyond the (separately ownership-verified) target_id for updates/deletes.
 */
export function buildSafeChange(input: {
  kind: Exclude<ChangeKind, "lease">;
  action: ChangeAction;
  memberId: string;
  targetId?: string | null;
  payload?: Record<string, any>;
}): { action: ChangeAction; target_collection: string; target_id: string | null; payload: Record<string, any> } {
  const { kind } = input;
  const raw = input.payload || {};
  const target_collection = KIND_TARGET[kind];

  if (kind === "name") {
    const first_name = nameField(raw.first_name);
    const last_name = nameField(raw.last_name);
    if (!first_name && !last_name) throw createError({ statusCode: 400, message: "Give a first or last name." });
    return { action: "update", target_collection, target_id: input.memberId, payload: { first_name, last_name } };
  }
  if (kind === "contact") {
    return {
      action: "update",
      target_collection,
      target_id: input.memberId,
      payload: { phone: str(raw.phone) },
    };
  }
  if (kind === "mailing_address") {
    return {
      action: "update",
      target_collection,
      target_id: input.memberId,
      payload: { mailing_address: sanitizeMailing(raw.mailing_address ?? raw) },
    };
  }

  // vehicle / pet
  const fields = kind === "vehicle" ? VEHICLE_FIELDS : PET_FIELDS;
  if (input.action === "delete") {
    return { action: "delete", target_collection, target_id: input.targetId || null, payload: {} };
  }
  return {
    action: input.action === "create" ? "create" : "update",
    target_collection,
    target_id: input.action === "create" ? null : input.targetId || null,
    payload: pick(raw, fields),
  };
}

/**
 * Apply an APPROVED change request to the live record, using the admin client.
 * `cr` is the stored change-request row. `nowIso` is passed in (no Date.now in
 * shared code that must stay deterministic for tests). A lease needs the
 * reviewer (an invitation goes out in someone's name) and says what it did.
 */
export async function applyChangeRequest(
  admin: ReturnType<typeof getTypedDirectus>,
  cr: any,
  nowIso: string,
  ctx: { reviewerUserId?: string } = {}
): Promise<LeaseApproval | void> {
  const kind = cr.kind as ChangeKind;
  const action = cr.action as ChangeAction;
  const payload = cr.payload || {};
  const memberId = typeof cr.member === "string" ? cr.member : cr.member?.id;
  const orgId = typeof cr.organization === "string" ? cr.organization : cr.organization?.id;

  if (kind === "lease") {
    return await applyLeaseRequest(cr, { reviewerUserId: ctx.reviewerUserId ?? "" });
  }

  if (kind === "name") {
    // Only the two name fields, whatever else the stored payload holds.
    await admin.request(
      updateItem("hoa_members", memberId, { first_name: nameField(payload.first_name), last_name: nameField(payload.last_name) })
    );
    return;
  }
  if (kind === "contact") {
    await admin.request(updateItem("hoa_members", memberId, { phone: str(payload.phone) }));
    return;
  }
  if (kind === "mailing_address") {
    await admin.request(updateItem("hoa_members", memberId, { mailing_address: payload.mailing_address ?? null }));
    return;
  }

  const collection = KIND_TARGET[kind];
  const fields = kind === "vehicle" ? VEHICLE_FIELDS : PET_FIELDS;
  if (action === "create") {
    // The unit the resident chose, if it is still theirs, else their only one
    // (chooseRecordUnit). Without it the row reached My Household but no unit page.
    const units = (await memberUnitsInOrg(orgId, memberId)).map((u) => u.id);
    await admin.request(
      createItem(collection, {
        ...pick(payload, fields),
        unit_id: chooseRecordUnit(payload.unit_id, units),
        member_id: memberId,
        organization: orgId,
        status: "published",
        start_date: nowIso,
      })
    );
    return;
  }
  if (action === "update") {
    await admin.request(updateItem(collection, cr.target_id, pick(payload, fields)));
    return;
  }
  if (action === "delete") {
    // Soft-remove, mirroring move-out handling (keep history, set end_date).
    await admin.request(updateItem(collection, cr.target_id, { status: "archived", end_date: nowIso }));
    return;
  }
}

/**
 * Verify a vehicle/pet target_id actually belongs to `memberId` before letting a
 * resident propose an update/delete on it. Throws 403 otherwise.
 */
export async function assertTargetOwnedByMember(
  admin: ReturnType<typeof getTypedDirectus>,
  collection: "hoa_vehicles" | "hoa_pets",
  targetId: string,
  memberId: string
): Promise<void> {
  let row: any;
  try {
    row = await admin.request(readItem(collection, targetId, { fields: ["id", "member_id"] }));
  } catch {
    row = null;
  }
  const owner = row && (typeof row.member_id === "string" ? row.member_id : row.member_id?.id);
  if (!row || owner !== memberId) {
    throw createError({ statusCode: 403, message: "That record isn't yours to change." });
  }
}

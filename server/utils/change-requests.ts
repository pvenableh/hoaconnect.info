/**
 * Member self-service change-request helpers.
 *
 * Residents propose changes to their OWN household data; the change is stored as
 * a pending `hoa_member_change_requests` row and only applied to the live record
 * when an Admin / Property Manager approves. All field access is whitelisted
 * here so a resident can never smuggle in privileged fields (role, balance, the
 * owning org, another member's id, etc.).
 */
import { createItem, readItem, updateItem } from "@directus/sdk";

export const CHANGE_KINDS = ["contact", "mailing_address", "vehicle", "pet"] as const;
export const CHANGE_ACTIONS = ["create", "update", "delete"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];
export type ChangeAction = (typeof CHANGE_ACTIONS)[number];

// kind → the collection the approved change writes to.
export const KIND_TARGET: Record<ChangeKind, string> = {
  contact: "hoa_members",
  mailing_address: "hoa_members",
  vehicle: "hoa_vehicles",
  pet: "hoa_pets",
};

// Whitelisted, resident-editable fields per kind.
const VEHICLE_FIELDS = ["make", "model", "year", "license_plate", "parking_spot", "image"];
const PET_FIELDS = ["name", "type", "breed", "weight", "image"];

const str = (v: unknown) => (typeof v === "string" ? v.trim() || null : v == null ? null : String(v));

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
  kind: ChangeKind;
  action: ChangeAction;
  memberId: string;
  targetId?: string | null;
  payload?: Record<string, any>;
}): { action: ChangeAction; target_collection: string; target_id: string | null; payload: Record<string, any> } {
  const { kind } = input;
  const raw = input.payload || {};
  const target_collection = KIND_TARGET[kind];

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
 * shared code that must stay deterministic for tests).
 */
export async function applyChangeRequest(admin: any, cr: any, nowIso: string): Promise<void> {
  const kind = cr.kind as ChangeKind;
  const action = cr.action as ChangeAction;
  const payload = cr.payload || {};
  const memberId = typeof cr.member === "string" ? cr.member : cr.member?.id;
  const orgId = typeof cr.organization === "string" ? cr.organization : cr.organization?.id;

  if (kind === "contact") {
    await admin.request(updateItem("hoa_members", memberId, { phone: str(payload.phone) }));
    return;
  }
  if (kind === "mailing_address") {
    await admin.request(updateItem("hoa_members", memberId, { mailing_address: payload.mailing_address ?? null }));
    return;
  }

  const collection = KIND_TARGET[kind];
  if (action === "create") {
    await admin.request(
      createItem(collection, {
        ...payload,
        member_id: memberId,
        organization: orgId,
        status: "published",
        start_date: nowIso,
      })
    );
    return;
  }
  if (action === "update") {
    await admin.request(updateItem(collection, cr.target_id, payload));
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
  admin: any,
  collection: string,
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

/**
 * An admin adding or changing a unit's pets, vehicles and leases: the bodies
 * POST and PATCH /api/hoa/units/records take, and whose row is whose. Also
 * which unit a resident's approved pet or vehicle goes on.
 *
 * Directus cannot check these writes. A validation on a relation refuses the
 * plain id the page sends and passes an object holding only the id
 * (scripts/lib/admin-scope-perms.ts); the lease rule checked only the lease's
 * own `organization`, never the unit, tenant or owner it names. So the HOA
 * Admin policy has no create or update on hoa_pets, hoa_vehicles or
 * hoa_leases, and the routes check the unit, the people and the files.
 *
 * Pure: no Directus.
 */
import { z } from "zod";

export const RECORD_KINDS = ["pet", "vehicle", "lease"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export const RECORD_COLLECTION: Record<RecordKind, "hoa_pets" | "hoa_vehicles" | "hoa_leases"> = {
  pet: "hoa_pets",
  vehicle: "hoa_vehicles",
  lease: "hoa_leases",
};

export const PET_TYPES = ["dog", "cat", "bird", "reptile", "other"] as const;
export const RECORD_STATUSES = ["published", "draft", "archived"] as const;
export const LEASE_STATUSES = ["active", "expired", "terminated"] as const;

const id = z.string().uuid("That isn't a valid id.");
const text = (max: number) => z.string().trim().max(max).nullable().optional();
const when = z.string().datetime({ offset: true, message: "Use a date and time." }).nullable().optional();
const money = z.number({ message: "Use a number." }).finite().nonnegative("Use an amount of zero or more.").max(100_000_000).nullable().optional();

const common = {
  member_id: id,
  image: id.nullable().optional(),
  start_date: when,
  end_date: when,
  status: z.enum(RECORD_STATUSES).optional(),
};

const petFields = {
  ...common,
  name: z.string().trim().min(1, "Give the pet a name.").max(200),
  type: z.enum(PET_TYPES).nullable().optional(),
  breed: text(200),
  weight: text(40),
};

const vehicleFields = {
  ...common,
  make: z.string().trim().min(1, "Give the vehicle a make.").max(200),
  model: text(200),
  year: text(10),
  license_plate: text(40),
  parking_spot: text(80),
};

const leaseFields = {
  tenant: id,
  owner: id.nullable().optional(),
  start_date: when,
  end_date: when,
  rent_amount: money,
  deposit_amount: money,
  document: id.nullable().optional(),
  notes: text(5000),
  status: z.enum(LEASE_STATUSES).optional(),
};

const someField = (v: object) => Object.keys(v).length > 0;
const orgId = z.string().min(1, "orgId is required");

export const createRecordBody = z.discriminatedUnion("kind", [
  z.object({ orgId, unitId: id, kind: z.literal("pet"), record: z.object(petFields).strict() }).strict(),
  z.object({ orgId, unitId: id, kind: z.literal("vehicle"), record: z.object(vehicleFields).strict() }).strict(),
  z.object({ orgId, unitId: id, kind: z.literal("lease"), record: z.object(leaseFields).strict() }).strict(),
]);

export const patchRecordBody = z.discriminatedUnion("kind", [
  z
    .object({ orgId, id, kind: z.literal("pet"), patch: z.object(petFields).partial().strict().refine(someField, "Nothing to change.") })
    .strict(),
  z
    .object({ orgId, id, kind: z.literal("vehicle"), patch: z.object(vehicleFields).partial().strict().refine(someField, "Nothing to change.") })
    .strict(),
  z
    .object({ orgId, id, kind: z.literal("lease"), patch: z.object(leaseFields).partial().strict().refine(someField, "Nothing to change.") })
    .strict(),
]);

export type CreateRecordBody = z.infer<typeof createRecordBody>;
export type PatchRecordBody = z.infer<typeof patchRecordBody>;

const asId = (v: unknown): string | null =>
  typeof v === "string" ? v : ((v as { id?: unknown } | null)?.id as string | undefined) ?? null;

type Related = { organization?: unknown } | string | null | undefined;
const orgOf = (v: unknown) => (v && typeof v === "object" ? asId((v as { organization?: unknown }).organization) : null);

/** The one community the row's own `organization` and every related row's agree on, or null. */
function agreedCommunity(own: unknown, related: Related[]): string | null {
  const ids = new Set([asId(own), ...related.map(orgOf)].filter((v): v is string => !!v));
  return ids.size === 1 ? [...ids][0]! : null;
}

/**
 * The community a pet or vehicle row belongs to: its own `organization`, its
 * unit's and its person's, which must agree. Null when none is set or two
 * disagree, so a row that straddles two communities is no one's to edit here.
 */
export function recordCommunity(row: { organization?: unknown; unit_id?: Related; member_id?: Related }): string | null {
  return agreedCommunity(row.organization, [row.unit_id, row.member_id]);
}

/** The same for a lease: its own `organization`, its unit's, its tenant's and its owner's. */
export function leaseCommunity(row: { organization?: unknown; unit?: Related; tenant?: Related; owner?: Related }): string | null {
  return agreedCommunity(row.organization, [row.unit, row.tenant, row.owner]);
}

/** A row of `hoa_member_units` read with its unit's id and community. */
export interface UnitLink {
  unit_id?: { id?: string; organization?: unknown; unit_number?: string | null } | string | null;
  status?: string | null;
  end_date?: string | null;
  is_primary_unit?: boolean | null;
}

/**
 * The units a person is linked to in `orgId` on `today` (YYYY-MM-DD), primary
 * first: a link that is not archived and has not ended.
 */
export function currentUnitsInOrg(links: readonly UnitLink[], orgId: string, today: string): { id: string; unit_number: string | null }[] {
  const out: { id: string; unit_number: string | null; primary: boolean }[] = [];
  for (const l of links) {
    const unit = l.unit_id && typeof l.unit_id === "object" ? l.unit_id : null;
    if (!unit?.id || asId(unit.organization) !== orgId) continue;
    if (l.status === "archived") continue;
    if (l.end_date && l.end_date.slice(0, 10) < today) continue;
    if (out.some((u) => u.id === unit.id)) continue;
    out.push({ id: unit.id, unit_number: unit.unit_number ?? null, primary: !!l.is_primary_unit });
  }
  return out.sort((a, b) => Number(b.primary) - Number(a.primary)).map(({ id, unit_number }) => ({ id, unit_number }));
}

/**
 * The unit a resident's pet or vehicle goes on when their request is approved:
 * the one they chose if it is still theirs, else their only unit, else none.
 */
export function chooseRecordUnit(requested: unknown, memberUnits: readonly string[]): string | null {
  if (typeof requested === "string" && memberUnits.includes(requested)) return requested;
  return memberUnits.length === 1 ? memberUnits[0]! : null;
}

/**
 * An admin adding or changing a unit's pets and vehicles: the bodies
 * POST and PATCH /api/hoa/units/records take, and whose row is whose.
 *
 * Directus cannot check these writes: the HOA Admin validation followed
 * `member_id` to its community, which refuses the plain id the page sends and
 * passes an object holding only the id (scripts/lib/admin-scope-perms.ts). So
 * the HOA Admin policy has no create or update on hoa_pets and hoa_vehicles,
 * and the routes check the unit, the person and the photo.
 *
 * Pure: no Directus.
 */
import { z } from "zod";

export const RECORD_KINDS = ["pet", "vehicle"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export const RECORD_COLLECTION: Record<RecordKind, "hoa_pets" | "hoa_vehicles"> = {
  pet: "hoa_pets",
  vehicle: "hoa_vehicles",
};

export const PET_TYPES = ["dog", "cat", "bird", "reptile", "other"] as const;
export const RECORD_STATUSES = ["published", "draft", "archived"] as const;

const id = z.string().uuid("That isn't a valid id.");
const text = (max: number) => z.string().trim().max(max).nullable().optional();
const when = z.string().datetime({ offset: true, message: "Use a date and time." }).nullable().optional();

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

const someField = (v: object) => Object.keys(v).length > 0;
const orgId = z.string().min(1, "orgId is required");

export const createRecordBody = z.discriminatedUnion("kind", [
  z.object({ orgId, unitId: id, kind: z.literal("pet"), record: z.object(petFields).strict() }).strict(),
  z.object({ orgId, unitId: id, kind: z.literal("vehicle"), record: z.object(vehicleFields).strict() }).strict(),
]);

export const patchRecordBody = z.discriminatedUnion("kind", [
  z
    .object({ orgId, id, kind: z.literal("pet"), patch: z.object(petFields).partial().strict().refine(someField, "Nothing to change.") })
    .strict(),
  z
    .object({ orgId, id, kind: z.literal("vehicle"), patch: z.object(vehicleFields).partial().strict().refine(someField, "Nothing to change.") })
    .strict(),
]);

export type CreateRecordBody = z.infer<typeof createRecordBody>;
export type PatchRecordBody = z.infer<typeof patchRecordBody>;

const asId = (v: unknown): string | null =>
  typeof v === "string" ? v : ((v as { id?: unknown } | null)?.id as string | undefined) ?? null;

/**
 * The community a pet or vehicle row belongs to: its own `organization`, its
 * unit's and its person's, which must agree. Null when none is set or two
 * disagree, so a row that straddles two communities is no one's to edit here.
 */
export function recordCommunity(row: {
  organization?: unknown;
  unit_id?: { organization?: unknown } | string | null;
  member_id?: { organization?: unknown } | string | null;
}): string | null {
  const orgOf = (v: unknown) => (v && typeof v === "object" ? asId((v as { organization?: unknown }).organization) : null);
  const ids = new Set([asId(row.organization), orgOf(row.unit_id), orgOf(row.member_id)].filter((v): v is string => !!v));
  return ids.size === 1 ? [...ids][0]! : null;
}

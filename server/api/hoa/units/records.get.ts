import { readItems, readItem } from "@directus/sdk";

/**
 * Role-aware unit records read (Phase 6, Track 1).
 *
 * Returns the occupants, pets, vehicles and leases tied to a single unit, with
 * access enforced server-side (the precise rule below can't be expressed as a
 * Directus row policy because it compares each record's date window against the
 * viewer's occupancy window):
 *
 *   - App admin / HOA admin / active board member → ALL records on the unit.
 *   - Owner / tenant → only records whose active window OVERLAPS one of their
 *     own occupancy windows on this unit. So: full data on a unit they currently
 *     occupy, and on a unit they used to occupy only the records that existed
 *     while they lived there. A unit they never occupied → 403.
 *
 * Query: ?orgId=<uuid>&unitId=<uuid>
 */

// Two [start, end] windows overlap when each starts before/at the other's end.
// A null start = open at the beginning; a null end = still open (ongoing).
function windowsOverlap(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null
): boolean {
  const aStartsAfterBEnds = aStart && bEnd ? aStart > bEnd : false;
  const bStartsAfterAEnds = bStart && aEnd ? bStart > aEnd : false;
  return !aStartsAfterBEnds && !bStartsAfterAEnds;
}

export default defineEventHandler(async (event) => {
  const { orgId, unitId } = getQuery(event) as { orgId?: string; unitId?: string };

  if (!orgId || !unitId) {
    throw createError({ statusCode: 400, message: "orgId and unitId are required" });
  }

  const { userId } = await requireAuthenticatedUser(event);
  const directus = getTypedDirectus();

  // Resolve the unit and confirm it belongs to the org.
  let unit: any;
  try {
    unit = await directus.request(
      readItem("hoa_units", unitId, { fields: ["id", "unit_number", "status", "organization"] })
    );
  } catch {
    throw createError({ statusCode: 404, message: "Unit not found" });
  }
  const unitOrg = typeof unit.organization === "string" ? unit.organization : unit.organization?.id;
  if (!unit || unitOrg !== orgId) {
    throw createError({ statusCode: 404, message: "Unit not found" });
  }

  // ── Determine access level ──────────────────────────────────────────────────
  const admin = await checkAdminAccess(event, orgId);
  let canViewAll = admin.isAdmin;

  // The viewer's own occupancy windows on THIS unit (used for the member rule and
  // also to detect board membership via their member record).
  const myMembers = await directus.request(
    readItems("hoa_members", {
      filter: { user: { _eq: userId }, organization: { _eq: orgId } },
      fields: ["id"],
      limit: -1,
    })
  );
  const myMemberIds = myMembers.map((m: any) => m.id);

  if (!canViewAll && myMemberIds.length) {
    // Active board member? (published term, current date within term window)
    const nowIso = new Date().toISOString();
    const boardTerms = await directus.request(
      readItems("hoa_board_members", {
        filter: {
          status: { _eq: "published" },
          hoa_member: { _in: myMemberIds },
          _or: [{ term_start: { _null: true } }, { term_start: { _lte: nowIso } }],
          // term_end null = open-ended; otherwise must not have passed
        },
        fields: ["id", "term_end"],
        limit: -1,
      })
    );
    canViewAll = boardTerms.some((t: any) => !t.term_end || t.term_end >= nowIso);
  }

  // A regular member's occupancy windows on this unit (current + historical).
  let myWindows: Array<{ start: string | null; end: string | null }> = [];
  if (!canViewAll) {
    if (!myMemberIds.length) {
      throw createError({ statusCode: 403, message: "Not a member of this organization" });
    }
    const myOccupancy = await directus.request(
      readItems("hoa_member_units", {
        filter: { member_id: { _in: myMemberIds }, unit_id: { _eq: unitId } },
        fields: ["start_date", "end_date"],
        limit: -1,
      })
    );
    if (!myOccupancy.length) {
      throw createError({ statusCode: 403, message: "You have not occupied this unit" });
    }
    myWindows = myOccupancy.map((o: any) => ({ start: o.start_date ?? null, end: o.end_date ?? null }));
  }

  // ── Fetch the unit's records (admin client = unrestricted; we scope by org) ──
  const [occupants, pets, vehicles, leases] = await Promise.all([
    directus.request(
      readItems("hoa_member_units", {
        filter: { unit_id: { _eq: unitId }, member_id: { organization: { _eq: orgId } } },
        fields: ["id", "is_primary_unit", "ownership_percentage", "start_date", "end_date", "member_id.id", "member_id.first_name", "member_id.last_name", "member_id.member_type", "member_id.email"],
        sort: ["-is_primary_unit", "end_date", "-start_date"],
        limit: -1,
      })
    ),
    directus.request(
      readItems("hoa_pets", {
        filter: { unit_id: { _eq: unitId }, organization: { _eq: orgId } },
        fields: ["id", "name", "type", "breed", "weight", "image", "status", "start_date", "end_date", "member_id.id", "member_id.first_name", "member_id.last_name"],
        sort: ["end_date", "name"],
        limit: -1,
      })
    ),
    directus.request(
      readItems("hoa_vehicles", {
        filter: { unit_id: { _eq: unitId }, organization: { _eq: orgId } },
        fields: ["id", "make", "model", "year", "license_plate", "parking_spot", "image", "status", "start_date", "end_date", "member_id.id", "member_id.first_name", "member_id.last_name"],
        sort: ["end_date", "make"],
        limit: -1,
      })
    ),
    directus.request(
      readItems("hoa_leases", {
        filter: { unit: { _eq: unitId }, organization: { _eq: orgId } },
        fields: ["id", "status", "start_date", "end_date", "rent_amount", "deposit_amount", "document", "notes", "tenant.id", "tenant.first_name", "tenant.last_name", "owner.id", "owner.first_name", "owner.last_name"],
        sort: ["end_date", "-start_date"],
        limit: -1,
      })
    ),
  ]);

  // Members only see rows overlapping one of their occupancy windows.
  const visible = <T extends { start_date?: string | null; end_date?: string | null }>(rows: T[]): T[] => {
    if (canViewAll) return rows;
    return rows.filter((r) =>
      myWindows.some((w) => windowsOverlap(r.start_date ?? null, r.end_date ?? null, w.start, w.end))
    );
  };

  return {
    access: canViewAll ? (admin.isAdmin ? "admin" : "board") : "member",
    canManage: admin.isAdmin, // only admins write; board + members are read-only
    unit: { id: unit.id, unit_number: unit.unit_number, status: unit.status },
    occupants: visible(occupants as any),
    pets: visible(pets as any),
    vehicles: visible(vehicles as any),
    leases: visible(leases as any),
  };
});

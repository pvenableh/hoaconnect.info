/**
 * useUnitRecords — occupants, pets, vehicles and leases tied to a single unit,
 * split into Current vs History (Phase 6, Track 1).
 *
 * Reads go through the role-aware server route (server/api/hoa/units/records):
 * admins & active board members see every record on the unit; owners/tenants see
 * only records overlapping their own occupancy windows. Writes are admin-only and
 * go straight to Directus (HOA Admin policy has full org CRUD on these
 * collections).
 *
 * History UX rule: on turnover we set end_date + status=archived rather than
 * deleting, so a unit's history is always answerable.
 */

export interface UnitRecordMember {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  member_type?: string | null;
  email?: string | null;
}

export interface OccupantRecord {
  id: string;
  is_primary_unit?: boolean | null;
  ownership_percentage?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  member_id?: UnitRecordMember | null;
}

export interface PetRecord {
  id: string;
  name?: string | null;
  type?: string | null;
  breed?: string | null;
  weight?: string | null;
  image?: string | null;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  member_id?: UnitRecordMember | null;
}

export interface VehicleRecord {
  id: string;
  make?: string | null;
  model?: string | null;
  year?: string | null;
  license_plate?: string | null;
  parking_spot?: string | null;
  image?: string | null;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  member_id?: UnitRecordMember | null;
}

export interface LeaseRecord {
  id: string;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  rent_amount?: number | null;
  deposit_amount?: number | null;
  document?: string | null;
  notes?: string | null;
  tenant?: UnitRecordMember | null;
  owner?: UnitRecordMember | null;
}

export interface UnitRecordsResponse {
  access: "admin" | "board" | "member";
  canManage: boolean;
  unit: { id: string; unit_number?: string | null; status?: string | null };
  occupants: OccupantRecord[];
  pets: PetRecord[];
  vehicles: VehicleRecord[];
  leases: LeaseRecord[];
}

// A record is "current" when it has no end_date or its end_date is still in the
// future; everything else is history.
export const isCurrentRecord = (r: { end_date?: string | null }): boolean => {
  if (!r.end_date) return true;
  return new Date(r.end_date).getTime() > Date.now();
};

export const useUnitRecords = (unitId: MaybeRefOrGetter<string>) => {
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);
  const pets = useDirectusItems("hoa_pets");
  const vehicles = useDirectusItems("hoa_vehicles");
  const leases = useDirectusItems("hoa_leases");

  const fetchRecords = async (): Promise<UnitRecordsResponse> => {
    const id = toValue(unitId);
    return await $fetch<UnitRecordsResponse>("/api/hoa/units/records", {
      query: { orgId: selectedOrgId.value, unitId: id },
    });
  };

  const split = <T extends { end_date?: string | null }>(rows: T[] = []) => ({
    current: rows.filter(isCurrentRecord),
    history: rows.filter((r) => !isCurrentRecord(r)),
  });

  // ── Writes (admin only) ──────────────────────────────────────────────────────
  const nowIso = () => new Date().toISOString();

  const createPet = (input: Partial<PetRecord> & { member_id: string }) =>
    pets.create({
      ...input,
      unit_id: toValue(unitId),
      organization: selectedOrgId.value,
      status: input.status || "published",
      start_date: input.start_date || nowIso(),
    });

  const updatePet = (id: string, patch: Partial<PetRecord>) => pets.update(id, patch);

  const createVehicle = (input: Partial<VehicleRecord> & { member_id: string }) =>
    vehicles.create({
      ...input,
      unit_id: toValue(unitId),
      organization: selectedOrgId.value,
      status: input.status || "published",
      start_date: input.start_date || nowIso(),
    });

  const updateVehicle = (id: string, patch: Partial<VehicleRecord>) => vehicles.update(id, patch);

  const createLease = (input: Partial<LeaseRecord> & { tenant?: string; owner?: string }) =>
    leases.create({
      ...input,
      unit: toValue(unitId),
      organization: selectedOrgId.value,
      status: input.status || "active",
      start_date: input.start_date || nowIso(),
    });

  const updateLease = (id: string, patch: Partial<LeaseRecord>) => leases.update(id, patch);

  // "Move out / end" — end-date + archive instead of deleting.
  const endRecord = (kind: "pet" | "vehicle" | "lease", id: string, endDate?: string) => {
    const end_date = endDate || nowIso();
    if (kind === "pet") return pets.update(id, { end_date, status: "archived" });
    if (kind === "vehicle") return vehicles.update(id, { end_date, status: "archived" });
    return leases.update(id, { end_date, status: "expired" });
  };

  return {
    fetchRecords,
    split,
    createPet,
    updatePet,
    createVehicle,
    updateVehicle,
    createLease,
    updateLease,
    endRecord,
  };
};

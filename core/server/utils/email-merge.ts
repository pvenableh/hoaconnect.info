/**
 * Phase 9 (Stage B) — dynamic merge fields for the Communications system.
 *
 * A small registry of `{{token}}` merge fields resolved per recipient at send
 * time. Resident/unit/org fields plus the first vehicle/pet and parking spot.
 *
 * - MERGE_FIELDS: catalog used by the composer's "Insert field" menu.
 * - resolveMergeFields(member, org): per-recipient values map.
 * - applyMergeFields(html, values): substitute {{token}} (case-insensitive).
 * - SAMPLE_MERGE_VALUES(org): realistic sample values for preview.
 */
import type { HoaMember, HoaOrganization } from "#core/types/directus";
import { residencyFor } from "#core/shared/members/residency";

export interface MergeField {
  token: string;
  label: string;
  group: "Resident" | "Unit" | "Vehicle" | "Pet" | "Organization";
}

export const MERGE_FIELDS: MergeField[] = [
  // Resident
  { token: "first_name", label: "First name", group: "Resident" },
  { token: "last_name", label: "Last name", group: "Resident" },
  { token: "full_name", label: "Full name", group: "Resident" },
  { token: "email", label: "Email", group: "Resident" },
  { token: "phone", label: "Phone", group: "Resident" },
  { token: "member_type", label: "Member type (owner/tenant)", group: "Resident" },
  { token: "company", label: "Company", group: "Resident" },
  { token: "outstanding_balance", label: "Outstanding balance", group: "Resident" },
  { token: "payment_status", label: "Payment status", group: "Resident" },
  { token: "last_payment_amount", label: "Last payment amount", group: "Resident" },
  { token: "last_payment_date", label: "Last payment date", group: "Resident" },
  // Unit
  { token: "unit", label: "Unit number", group: "Unit" },
  { token: "unit_number", label: "Unit number", group: "Unit" },
  // Vehicle (first/primary)
  { token: "vehicle", label: "Vehicle (year make model)", group: "Vehicle" },
  { token: "license_plate", label: "License plate", group: "Vehicle" },
  { token: "parking_spot", label: "Parking spot #", group: "Vehicle" },
  // Pet (first)
  { token: "pet", label: "Pet name", group: "Pet" },
  { token: "pet_type", label: "Pet type", group: "Pet" },
  // Organization
  { token: "org_name", label: "Organization name", group: "Organization" },
  { token: "org_legal_name", label: "Legal name", group: "Organization" },
  { token: "org_address", label: "Address", group: "Organization" },
  { token: "org_email", label: "Org email", group: "Organization" },
  { token: "org_phone", label: "Org phone", group: "Organization" },
];

type Resolved = Record<string, string>;

function money(v: number | null | undefined): string {
  if (v == null) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);
}

function dateStr(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function orgAddress(org: Partial<HoaOrganization>): string {
  return [org.street_address, org.city, org.state, org.zip].filter(Boolean).join(", ");
}

/**
 * Build the per-recipient merge values. `member` should be fetched with
 * units.unit_id.unit_number, vehicles.*, and pets.* populated.
 */
export function resolveMergeFields(
  member: any,
  org: Partial<HoaOrganization>
): Resolved {
  const firstName = member?.first_name || "";
  const lastName = member?.last_name || "";

  const primaryUnit =
    member?.units?.find((u: any) => u?.is_primary_unit) || member?.units?.[0];
  const unitNumber =
    primaryUnit?.unit_id?.unit_number || primaryUnit?.unit_id || "";

  const vehicle = member?.vehicles?.[0];
  const vehicleLabel = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")
    : "";

  const pet = member?.pets?.[0];

  return {
    first_name: firstName,
    last_name: lastName,
    full_name: `${firstName} ${lastName}`.trim(),
    email: member?.email || "",
    phone: member?.phone || "",
    // Resolved, not read raw: residency lives on the unit link first and falls
    // back to hoa_members.member_type. A caller that fetched the `units` alias
    // (send.post.ts and sendEmailJob both do) gets the link's answer here; one
    // that did not still gets the member's, unchanged.
    member_type: residencyFor(member) || "",
    company: member?.company || "",
    outstanding_balance: money(member?.outstanding_balance),
    payment_status: member?.payment_status || "",
    last_payment_amount: money(member?.last_payment_amount),
    last_payment_date: dateStr(member?.last_payment_date),

    unit: String(unitNumber || ""),
    unit_number: String(unitNumber || ""),

    vehicle: vehicleLabel,
    license_plate: vehicle?.license_plate || "",
    parking_spot: vehicle?.parking_spot || "",

    pet: pet?.name || "",
    pet_type: pet?.type || "",

    org_name: org?.name || "",
    org_legal_name: org?.legal_name || "",
    org_address: orgAddress(org),
    org_email: org?.email || "",
    org_phone: org?.phone || "",
  };
}

/**
 * Replace every {{token}} (case-insensitive, optional inner whitespace) with its
 * resolved value. Unknown tokens are left as-is so typos are visible.
 */
export function applyMergeFields(input: string, values: Resolved): string {
  if (!input) return input;
  return input.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (match, token: string) => {
    const key = token.toLowerCase();
    return values[key] ?? match;
  });
}

/**
 * Sample values for the preview (no real recipient). Org fields are real.
 */
export function SAMPLE_MERGE_VALUES(org: Partial<HoaOrganization>): Resolved {
  return {
    first_name: "Jordan",
    last_name: "Rivera",
    full_name: "Jordan Rivera",
    email: "jordan.rivera@example.com",
    phone: "(555) 123-4567",
    member_type: "owner",
    company: "",
    outstanding_balance: money(125),
    payment_status: "current",
    last_payment_amount: money(350),
    last_payment_date: dateStr(new Date().toISOString()),
    unit: "12B",
    unit_number: "12B",
    vehicle: "2022 Toyota RAV4",
    license_plate: "7ABC123",
    parking_spot: "P-14",
    pet: "Biscuit",
    pet_type: "dog",
    org_name: org?.name || "Your HOA",
    org_legal_name: org?.legal_name || "",
    org_address: orgAddress(org),
    org_email: org?.email || "",
    org_phone: org?.phone || "",
  };
}

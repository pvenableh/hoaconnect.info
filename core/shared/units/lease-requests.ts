/**
 * An owner reports that their unit is rented (a change request of kind
 * `lease`): what they send, which of their units they may report on, and the
 * line a reviewer reads in Approvals.
 *
 * One approval records the lease on the unit and links or invites the tenant
 * (core/server/utils/lease-requests.ts). No rent: the board needs who, where,
 * when and the signed lease, not the money.
 *
 * Pure: no Directus.
 */
import { z } from "zod";
import { dateInputToTimestamp } from "./record-dates";
import type { UnitLink } from "./record-writes";

/** The signed lease: one PDF, small enough for one request (the host refuses a body over 4.5 MB). */
export const LEASE_DOCUMENT_MAX_BYTES = 4 * 1024 * 1024;
export const LEASE_DOCUMENT_TYPE = "application/pdf";

const day = (label: string) =>
  z
    .string({ message: `Pick the ${label} date.` })
    .refine((v) => dateInputToTimestamp(v) !== null, `Pick the ${label} date.`);

const name = (label: string) => z.string({ message: `Enter the tenant's ${label}.` }).trim().min(1, `Enter the tenant's ${label}.`).max(100);

/** What the owner's form sends as the request's `payload`. */
export const leaseRequestInput = z
  .object({
    unit_id: z.string().uuid("Pick one of your units.").nullable().optional(),
    tenant_first_name: name("first name"),
    tenant_last_name: name("last name"),
    tenant_email: z
      .string({ message: "Enter the tenant's email." })
      .trim()
      .toLowerCase()
      .email("Enter the tenant's email."),
    start_date: day("start"),
    end_date: day("end"),
    document: z.string({ message: "Attach the signed lease." }).uuid("Attach the signed lease."),
  })
  .refine((v) => v.end_date > v.start_date, { message: "The lease has to end after it starts.", path: ["end_date"] });

export type LeaseRequestInput = z.infer<typeof leaseRequestInput>;

/** The payload stored on the request, once the server has checked it. */
export interface LeaseRequestPayload {
  unit_id: string;
  unit_number: string | null;
  tenant_first_name: string;
  tenant_last_name: string;
  tenant_email: string;
  /** Noon UTC on the picked day (record-dates.ts). */
  start_date: string;
  end_date: string;
  document: string;
  document_name: string | null;
  /** Set on approval. */
  lease_id?: string;
  tenant_member_id?: string | null;
  invitation_id?: string | null;
}

/** A unit link read with its own residency (`hoa_member_units.member_type`). */
export interface OwnerUnitLink extends UnitLink {
  member_type?: string | null;
}

/**
 * The units a person owns in `orgId` on `today` (YYYY-MM-DD), primary first: a
 * current link (not archived, not ended) whose residency is owner. A link
 * with no residency falls back to the person's own `member_type`, as
 * residencyFor() does (core/shared/members/residency.ts).
 */
export function ownedUnitsInOrg(
  links: readonly OwnerUnitLink[],
  memberType: unknown,
  orgId: string,
  today: string
): { id: string; unit_number: string | null }[] {
  const out: { id: string; unit_number: string | null; primary: boolean }[] = [];
  for (const l of links) {
    const unit = l.unit_id && typeof l.unit_id === "object" ? l.unit_id : null;
    if (!unit?.id) continue;
    const org = typeof unit.organization === "string" ? unit.organization : (unit.organization as { id?: string } | null)?.id;
    if (org !== orgId) continue;
    if (l.status === "archived") continue;
    if (l.end_date && l.end_date.slice(0, 10) < today) continue;
    const residency = l.member_type === "owner" || l.member_type === "tenant" ? l.member_type : memberType;
    if (residency !== "owner") continue;
    if (out.some((u) => u.id === unit.id)) continue;
    out.push({ id: unit.id, unit_number: unit.unit_number ?? null, primary: !!l.is_primary_unit });
  }
  return out.sort((a, b) => Number(b.primary) - Number(a.primary)).map(({ id, unit_number }) => ({ id, unit_number }));
}

/** "Dec 1, 2026", the day the owner picked (stored as noon UTC). */
export function leaseDay(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** The reviewer's line: "Unit 4B · Jane Doe · Dec 1, 2026 – Nov 30, 2027". */
export function leaseRequestLine(p: Partial<LeaseRequestPayload> | null | undefined): string {
  const unit = p?.unit_number ? `Unit ${p.unit_number}` : "Unit";
  const tenant = [p?.tenant_first_name, p?.tenant_last_name].filter(Boolean).join(" ") || "Tenant";
  const dates = [leaseDay(p?.start_date), leaseDay(p?.end_date)].filter(Boolean).join(" – ");
  return [unit, tenant, dates].filter(Boolean).join(" · ");
}

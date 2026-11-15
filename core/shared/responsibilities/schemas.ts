/**
 * The register's request bodies (docs/spec-responsibilities.md, "Actions").
 * Shared so a form can check what the route will check. The routes still run
 * validateTarget and the org checks: a body that parses is not yet allowed.
 */
import { z } from "zod";
import {
  BASIS_KEYS,
  CADENCE_KEYS,
  CATEGORY_KEYS,
  END_REASON_KEYS,
  OFFICE_KEYS,
  ROLE_KEYS,
} from "./config";
import { isDateOnly } from "./holders";

const tuple = <T extends string>(xs: readonly T[]) => xs as unknown as [T, ...T[]];

export const dateOnly = z.string().refine(isDateOnly, "Use a date (YYYY-MM-DD).");
const id = z.string().uuid("That isn't a valid id.");
const orgId = z.string().trim().min(1, "orgId is required");
const text = (max: number) => z.string().max(max).nullish();

export const targetBody = z.object({
  office: z.enum(tuple(OFFICE_KEYS)).nullish(),
  member: id.nullish(),
  user: id.nullish(),
  vendor: id.nullish(),
  team: id.nullish(),
  label: z.string().trim().max(200).nullish(),
});

export const holderBody = targetBody.extend({
  role: z.enum(tuple(ROLE_KEYS)).optional(),
  start_date: dateOnly.optional(),
  notes: text(2000),
});

const jobFields = {
  title: z.string().trim().min(2, "Give the job a title.").max(255),
  description: text(5000),
  category: z.enum(tuple(CATEGORY_KEYS), { message: "Choose a category." }),
  cadence: z.enum(tuple(CADENCE_KEYS)).nullish(),
  basis: z.enum(tuple(BASIS_KEYS)).optional(),
  basis_reference: z.string().trim().max(255).nullish(),
  area: z.string().max(64).nullish(),
  member_visible: z.boolean().optional(),
  project: id.nullish(),
  notes: text(5000),
  evidence: z.array(id).max(20, "Attach up to 20 files.").optional(),
  last_verified: dateOnly.nullish(),
  sort: z.number().int().nullish(),
};

export const createJobBody = z.object({
  orgId,
  ...jobFields,
  status: z.enum(["active", "disputed"]).optional(),
  holders: z.array(holderBody).max(10).optional(),
});

export const patchJobBody = z
  .object({ orgId, ...jobFields, status: z.enum(["active", "disputed"]) })
  .partial()
  .required({ orgId: true })
  .strict();

export const retireBody = z.object({ orgId, effective: dateOnly.optional() });

export const addHolderBody = holderBody.extend({ orgId });

export const handOverBody = z.object({
  orgId,
  assignee: id,
  effective: dateOnly,
  next: targetBody.extend({ role: z.enum(tuple(ROLE_KEYS)).optional(), notes: text(2000) }).nullish(),
});

/** Correction only: never the target. `.strict()` refuses one outright. */
export const correctHolderBody = z
  .object({
    orgId,
    notes: text(2000),
    role: z.enum(tuple(ROLE_KEYS)).optional(),
    start_date: dateOnly.optional(),
    end_date: dateOnly.optional(),
  })
  .strict();

export const applyTemplateBody = z.object({ orgId, template: z.string().min(1) });

export const visibilityBody = z
  .object({ orgId, published: z.boolean().optional(), showUnassigned: z.boolean().optional() })
  .strict()
  .refine((b) => b.published !== undefined || b.showUnassigned !== undefined, "Say which switch to change.");

export const endTermBody = z.object({
  orgId,
  lastDay: dateOnly,
  reason: z.enum(["term_ended", "resigned", "removed"], { message: "Say why the term ended." }),
});

export const changeOfficeBody = z.object({ orgId, effective: dateOnly, office: z.enum(tuple(OFFICE_KEYS)) });

/** Correction only: never the member. `.strict()` refuses `hoa_member` outright. */
export const correctTermBody = z
  .object({
    orgId,
    title: z.enum(tuple(OFFICE_KEYS)).optional(),
    term_start: dateOnly.nullish(),
    term_end: dateOnly.nullish(),
    end_reason: z.enum(tuple(END_REASON_KEYS)).nullish(),
    message: text(2000),
    icon: z.string().max(100).nullish(),
    status: z.enum(["published", "draft", "archived"]).optional(),
  })
  .strict();

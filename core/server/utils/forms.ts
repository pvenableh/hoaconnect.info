/**
 * The lookups behind forms to sign (docs/scope-notices-and-forms.md, step 4).
 * Who owes a signature is decided in `#core/shared/home/forms`, pure; this file
 * only reads rows with the admin token and always filters by the organization
 * the caller was checked against.
 */
import { readItems } from "@directus/sdk";
import type { SignForm, SignatureRecord } from "#core/shared/home/forms";
import type { ReadSpec } from "./directus-graphql";

const idOf = (v: any): string | null => (v && typeof v === "object" ? (v.id ?? null) : v ? String(v) : null);

const FORM_FIELDS = ["id", "organization", "status", "title", "description", "document", "audience", "due_date", "sent_at"] as const;

export interface SignFormRow extends SignForm {
  description: string | null;
  /** The file id of the document to read, if one is attached. */
  document: string | null;
}

export const toForm = (r: any): SignFormRow => ({
  id: String(r.id),
  organization: idOf(r.organization) as string,
  status: r.status ?? null,
  title: r.title ?? null,
  description: r.description ?? null,
  document: idOf(r.document),
  audience: r.audience ?? null,
  due_date: r.due_date ?? null,
  sent_at: r.sent_at ?? null,
});

/** Forms in `orgId`; `onlyOpen` leaves drafts and closed ones out (the pure core also does). */
export async function readSignForms(orgId: string, opts: { onlyId?: string; onlyOpen?: boolean } = {}): Promise<SignFormRow[]> {
  const { collection, ...query } = signFormsSpec(orgId, opts);
  const rows = (await getTypedDirectus().request(readItems(collection as "hoa_forms", query as never))) as any[];
  return (rows ?? []).map(toForm);
}

/** readSignForms' read, as a batch spec (rows map through `toForm`). */
export function signFormsSpec(orgId: string, opts: { onlyId?: string; onlyOpen?: boolean } = {}): ReadSpec {
  return {
    collection: "hoa_forms",
    filter: {
      organization: { _eq: orgId },
      ...(opts.onlyOpen ? { status: { _eq: "open" } } : {}),
      ...(opts.onlyId ? { id: { _eq: opts.onlyId } } : {}),
    },
    fields: [...FORM_FIELDS],
    limit: -1,
  };
}

export interface SignatureRow extends SignatureRecord {
  id: string;
  signedAt: string;
  signedName: string;
  ip: string | null;
  userAgent: string | null;
}

/** Signature rows in `orgId`, for one member or one form. */
export async function readSignatures(orgId: string, by: { member?: string; form?: string }): Promise<SignatureRow[]> {
  const { collection, ...query } = signaturesSpec(orgId, by);
  const rows = (await getTypedDirectus().request(readItems(collection as "hoa_form_signatures", query as never))) as any[];
  return (rows ?? []).map(toSignature);
}

/**
 * readSignatures' read, as a batch spec (rows map through `toSignature`).
 * `memberOf` reads the signatures of every membership `memberOf` (a user id)
 * holds here, for a batch that cannot wait for the membership id: keep the
 * one you mean afterwards.
 */
export function signaturesSpec(orgId: string, by: { member?: string; form?: string; memberOf?: string }): ReadSpec {
  return {
    collection: "hoa_form_signatures",
    filter: {
      organization: { _eq: orgId },
      ...(by.member ? { member: { _eq: by.member } } : {}),
      ...(by.memberOf ? { member: { user: { _eq: by.memberOf } } } : {}),
      ...(by.form ? { form: { _eq: by.form } } : {}),
    },
    fields: ["id", "form", "member", "organization", "signed_at", "signed_name", "ip", "user_agent"],
    limit: -1,
  };
}

export function toSignature(r: any): SignatureRow {
  return {
    id: String(r.id),
    form: idOf(r.form) as string,
    member: idOf(r.member) as string,
    organization: idOf(r.organization) as string,
    signedAt: r.signed_at,
    signedName: r.signed_name,
    ip: r.ip ?? null,
    userAgent: r.user_agent ?? null,
  };
}

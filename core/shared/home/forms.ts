// Who still owes a signature (docs/scope-notices-and-forms.md, step 3).
//
// Pure: no Directus, no clock (callers pass `now`). Same two rules as
// acknowledgments.ts:
//  - Organization: a form and a signature only count for the person's own
//    community. A row from another organization never matches.
//  - Role and hat: a form reaches a person only if its `audience` fits their
//    residency or board hat in THAT community (hats add: an owner on the board
//    is reached by "owners" and by "board").

import type { AckRecipient } from "./acknowledgments";

export type FormAudience = "owners" | "tenants" | "board" | "all";

/** The people a form can be addressed to; same shape as an acknowledgment recipient. */
export type FormRecipient = AckRecipient;

export interface SignForm {
  id: string;
  organization: string;
  /** draft | open | closed. Only `open` forms are owed. */
  status?: string | null;
  /** Defaults to owners (decision 2), so a null audience reaches owners only. */
  audience?: string | null;
  due_date?: string | null;
  sent_at?: string | null;
  title?: string | null;
}

export interface SignatureRecord {
  form: string;
  member: string;
  organization: string;
}

/** Does this form's audience include this person? Unknown audiences reach no one. */
export function formReaches(audience: string | null | undefined, who: Pick<FormRecipient, "residency" | "board">): boolean {
  switch (audience ?? "owners") {
    case "all":
      return true;
    case "owners":
      return who.residency === "owner";
    case "tenants":
      return who.residency === "tenant";
    case "board":
      return who.board;
    default:
      return false;
  }
}

/** Forms that are open for signing and belong to `orgId`. */
export function openForms(forms: readonly SignForm[], orgId: string): SignForm[] {
  return forms.filter((f) => f.organization === orgId && f.status === "open");
}

/**
 * The forms this person still owes, soonest due first (undated last, then
 * title). Past-due forms stay listed, and `isFormOverdue` marks them.
 */
export function outstandingFormsFor(
  who: FormRecipient,
  forms: readonly SignForm[],
  signatures: readonly SignatureRecord[]
): SignForm[] {
  const done = new Set(
    signatures.filter((s) => s.organization === who.organization && s.member === who.memberId).map((s) => s.form)
  );
  return openForms(forms, who.organization)
    .filter((f) => formReaches(f.audience, who) && !done.has(f.id))
    .sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return (a.title ?? "").localeCompare(b.title ?? "");
    });
}

/** The admin's "who has not signed" list for one form: reached members without a row. */
export function unsignedBy<T extends FormRecipient>(
  form: SignForm,
  recipients: readonly T[],
  signatures: readonly SignatureRecord[]
): T[] {
  const done = new Set(
    signatures.filter((s) => s.form === form.id && s.organization === form.organization).map((s) => s.member)
  );
  return recipients.filter(
    (r) => r.organization === form.organization && formReaches(form.audience, r) && !done.has(r.memberId)
  );
}

/** Is a form past its due date on `today` (YYYY-MM-DD)? */
export function isFormOverdue(form: Pick<SignForm, "due_date">, today: string): boolean {
  return !!form.due_date && form.due_date.slice(0, 10) < today;
}

/** The unique key stored on a row: one signature per member per form. */
export function signKey(formId: string, memberId: string): string {
  return `${formId}:${memberId}`;
}

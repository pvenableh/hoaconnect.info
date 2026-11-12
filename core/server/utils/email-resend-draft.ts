/**
 * A new draft of an email, addressed to some of its members: what "Resend to
 * the unknown" and "Retry failed" both make. Same content, class and
 * attachments; a custom list of exactly these members; no cc/bcc (the board
 * already had its copy, or will get one when the admin adds it); never
 * scheduled or recurring. Nothing is sent: the admin opens it in the composer.
 */
import * as sdk from "@directus/sdk";
import { buildUniqueWebSlug } from "./email-branding";

// The client is loosely typed (the routes pass getTypedDirectus(), the tests a
// stub), so the builders are used untyped, as in email-compliance.ts.
const readItems = (collection: string, query: Record<string, unknown>) => (sdk as any).readItems(collection, query);
const createItem = (collection: string, data: Record<string, unknown>) => (sdk as any).createItem(collection, data);

/** The fields of the original the draft copies. */
export const RESEND_DRAFT_SOURCE_FIELDS = [
  "subject",
  "content",
  "email_type",
  "content_mode",
  "greeting",
  "salutation",
  "include_board_footer",
  "header_text",
  "footer_image",
  { attachments: ["directus_files_id"] },
] as const;

export async function createResendDraft(
  directus: { request: (op: any) => Promise<any> },
  email: Record<string, any>,
  organizationId: string,
  memberIds: string[],
  opts: { emailClass: boolean }
): Promise<{ id: string }> {
  const taken = new Set(
    (
      (await directus.request(
        readItems("hoa_emails", {
          filter: { organization: { _eq: organizationId }, web_slug: { _nnull: true } },
          fields: ["web_slug"],
          limit: -1,
        })
      )) as Array<{ web_slug?: string | null }>
    )
      .map((r) => r.web_slug)
      .filter(Boolean) as string[]
  );

  const attachments = (Array.isArray(email.attachments) ? email.attachments : [])
    .map((a: any) => (typeof a?.directus_files_id === "object" ? a.directus_files_id?.id : a?.directus_files_id))
    .filter(Boolean)
    .map((fileId: string) => ({ directus_files_id: fileId }));

  return (await directus.request(
    createItem("hoa_emails", {
      organization: organizationId,
      subject: email.subject,
      content: email.content,
      email_type: email.email_type,
      content_mode: email.content_mode ?? "visual",
      greeting: email.greeting ?? null,
      salutation: email.salutation ?? null,
      include_board_footer: email.include_board_footer ?? true,
      header_text: email.header_text ?? null,
      footer_image: typeof email.footer_image === "object" ? (email.footer_image?.id ?? null) : (email.footer_image ?? null),
      status: "draft",
      scheduled_at: null,
      next_run_at: null,
      recurrence_rule: "none",
      recipient_filter: "custom",
      recipient_ids: memberIds,
      attachments,
      cc: null,
      bcc: null,
      web_slug: buildUniqueWebSlug(email.subject || "email", taken),
      ...(opts.emailClass && email.email_class ? { email_class: email.email_class } : {}),
    })
  )) as { id: string };
}

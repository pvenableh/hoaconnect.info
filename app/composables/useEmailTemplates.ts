// composables/useEmailTemplates.ts
/**
 * useEmailTemplates — reusable email templates for the Communications composer.
 *
 * Templates are org-scoped, or global when `organization` is null. Admins see
 * both their org's templates and global ones; they can only mutate their own.
 */
import type { HoaEmailTemplate } from "~~/types/directus";
import type { EmailType } from "~/composables/useEmailSystem";

export interface EmailTemplateInput {
  name: string;
  email_type?: EmailType;
  description?: string | null;
  subject?: string | null;
  content?: string | null;
  content_mode?: "visual" | "mjml";
  greeting?: string | null;
  salutation?: string | null;
  include_board_footer?: boolean;
}

export const useEmailTemplates = () => {
  const items = useDirectusItems<HoaEmailTemplate>("hoa_email_templates");

  const TEMPLATE_FIELDS = [
    "id",
    "name",
    "email_type",
    "description",
    "subject",
    "content",
    "content_mode",
    "greeting",
    "salutation",
    "include_board_footer",
    "organization",
    "date_updated",
  ];

  /**
   * List templates available to an org: its own + global (null-org) templates.
   */
  const listForOrg = async (orgId: string): Promise<HoaEmailTemplate[]> => {
    return await items.list({
      fields: TEMPLATE_FIELDS,
      filter: {
        status: { _eq: "published" },
        _or: [{ organization: { _eq: orgId } }, { organization: { _null: true } }],
      },
      sort: ["sort", "name"],
      limit: 200,
    });
  };

  const get = (id: string) => items.get(id, { fields: TEMPLATE_FIELDS });

  /**
   * Create a template owned by the given org.
   */
  const create = (orgId: string, input: EmailTemplateInput) =>
    items.create({
      ...input,
      organization: orgId,
      status: "published",
    } as Partial<HoaEmailTemplate>);

  const update = (id: string, input: Partial<EmailTemplateInput>) =>
    items.update(id, input as Partial<HoaEmailTemplate>);

  const remove = (id: string) => items.remove(id);

  /** Whether a template belongs to the given org (vs. a read-only global one). */
  const isOwnedBy = (tpl: HoaEmailTemplate, orgId: string): boolean => {
    const org = typeof tpl.organization === "string" ? tpl.organization : tpl.organization?.id;
    return !!org && org === orgId;
  };

  return { listForOrg, get, create, update, remove, isOwnedBy };
};

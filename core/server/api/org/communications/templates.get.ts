/**
 * GET /api/org/communications/templates?orgId= — the published email templates
 * a community can start from: its own and the global ones (no organization).
 * For the composer's template picker (docs/spec-delegation.md). Writing
 * templates stays on the admin's Templates page.
 *
 * Who: admin, a property manager with the `communications` grant, or a helper
 * or committee holding it.
 */
import { readForArea, requireOrgId } from "#core/server/utils/area-reads";

const TEMPLATE_FIELDS = [
  "id", "name", "email_type", "description", "subject", "content", "content_mode",
  "greeting", "salutation", "include_board_footer", "organization", "date_updated",
];

export default defineEventHandler(async (event) => {
  const orgId = requireOrgId(getQuery(event).orgId);
  const { rows } = await readForArea(event, orgId, "communications", {
    templates: {
      collection: "hoa_email_templates",
      filter: { status: { _eq: "published" }, _or: [{ organization: { _eq: orgId } }, { organization: { _null: true } }] },
      fields: TEMPLATE_FIELDS,
      sort: ["sort", "name"],
      limit: 200,
    },
  });
  return { templates: rows.templates };
});

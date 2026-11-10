// POST /api/ops/communities/:id/view-as — preview what a role can reach in this
// community (Phase 5 "view as", Peter's call 2026-11-10: a role preview). App
// Admin and Platform Support (`support`): it's for reproducing a problem.
//
// Body: reason, requestId, confirmed, role (tenant | owner | board | hoa_admin |
// property_manager), and boardTitle or grants where they apply. Read-only: no
// session is swapped and nothing is written but the ops_audit_log row every
// preview leaves (plan §5). The community's real people are counted, not named.
import { readItems } from "@directus/sdk";
import { z } from "zod";
import { rolePreview } from "#core/shared/ops/view-as";
import { beginOpsAction, loadOpsCommunityBilling, runOpsAction } from "#core/server/utils/ops-actions";

const readAny = readItems as any;
const schema = z.object({
  role: z.enum(["tenant", "owner", "board", "hoa_admin", "property_manager"], { message: "Choose a role." }),
  boardTitle: z.enum(["president", "vice_president", "secretary", "treasurer", "director"]).optional(),
  grants: z.array(z.string().max(32)).max(20).optional(),
});

export default defineEventHandler(async (event) => {
  const { actor, body } = await beginOpsAction(event, schema, "support");
  const id = getRouterParam(event, "id") ?? "";

  return runOpsAction({
    actor,
    action: "view_as",
    targetId: id,
    body,
    perform: async () => {
      const c = await loadOpsCommunityBilling(id);
      const preview = rolePreview({ role: body.role, boardTitle: body.boardTitle ?? null, grants: body.grants ?? [] });
      // How many real people hold the role here: context, not names.
      const config = useRuntimeConfig();
      const members = (await (getTypedDirectus() as any)
        .request(
          readAny("hoa_members", {
            filter: { organization: { _eq: c.org.id }, status: { _eq: "active" } },
            fields: ["role", "member_type"],
            limit: -1,
          })
        )
        .catch(() => [])) as any[];
      const roleId = (m: any) => (m.role && typeof m.role === "object" ? m.role.id : m.role);
      const holders =
        body.role === "hoa_admin"
          ? members.filter((m) => roleId(m) === config.public.directusRoleHoaAdmin).length
          : body.role === "property_manager"
            ? members.filter((m) => roleId(m) === config.public.directusRolePropertyManager).length
            : body.role === "tenant" || body.role === "owner"
              ? members.filter((m) => m.member_type === body.role).length
              : null;
      const label = body.role === "board" ? `board officer (${body.boardTitle ?? "director"})` : body.role.replace("_", " ");
      return {
        result: { community: { id: c.org.id, name: c.org.name }, holders, preview },
        audit: {
          summary: `Previewed ${c.org.name} as a ${label}.`,
          organization: c.org.id,
          organizationName: c.org.name,
          after: { role: body.role, boardTitle: body.boardTitle ?? null, grants: body.grants ?? [] },
        },
      };
    },
  });
});

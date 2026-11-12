// server/api/roles/list.get.ts
//
// The roles the invite form offers. A community admin sees only the three a
// community may hand out (member, HOA admin, property manager) — the invite and
// approve routes refuse anything else (core/server/utils/member-roles.ts), so
// offering App Administrator or Platform Support would only offer a 403. The
// App Admin still sees every role but Directus's own Administrator.
import { readRoles } from "@directus/sdk";
import { communityRoleIds } from "#core/server/utils/member-roles";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const actor = await getPlatformActor(event);
  const filter =
    actor?.role === "app_admin"
      ? { name: { _neq: "Administrator" } }
      : { id: { _in: communityRoleIds() } };

  try {
    const directus = getTypedDirectus();

    const roles = await directus.request(
      readRoles({
        filter,
        fields: ["id", "name", "description", "icon"],
      })
    );

    return { data: roles };
  } catch (error: any) {
    console.error("Error fetching roles:", error);
    throw createError({
      statusCode: 500,
      message: "Failed to fetch roles",
    });
  }
});

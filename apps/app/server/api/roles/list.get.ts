// server/api/roles/list.get.ts
import { readRoles } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  try {
    const directus = getTypedDirectus();

    const roles = await directus.request(
      readRoles({
        filter: {
          name: { _neq: "Administrator" },
        },
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

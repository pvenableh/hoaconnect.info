// server/api/hoa/find.get.ts
import { readItems } from "@directus/sdk";
import type { QueryFields } from "@directus/sdk";
import type { Schema, HoaOrganization } from "#core/types/directus";

export default defineEventHandler(async (event) => {
  const { slug } = getQuery(event);

  if (!slug) {
    throw createError({
      statusCode: 400,
      message: "Slug is required",
    });
  }

  const directus = getTypedDirectus();

  try {
    const organizations = await directus.request(
      readItems("hoa_organizations", {
        filter: {
          _and: [
            { slug: { _eq: slug as string } },
            { status: { _in: ["active", "published"] as string[] as NonNullable<HoaOrganization["status"]>[] } },
          ],
        },
        fields: [
          "*",
          {
            invitations: ["*"],
            amenities: ["*"],
            subscription: ["*"],
            subscription_plan: ["*"],
            logo: ["*"],
            settings: ["*", { logo: ["*"], icon: ["*"] }],
            hero: ["*", { background_image: ["*"], foreground_image: ["*"] }],
          },
        ] as QueryFields<Schema, HoaOrganization>,
        limit: 1,
      })
    );

    if (!organizations || organizations.length === 0) {
      throw createError({
        statusCode: 404,
        message: "Organization not found",
      });
    }

    const org = organizations[0] as Record<string, any>;

    // Attach the primary management company (first active `management` vendor) so
    // the public landing can feature it when the admin opts in. Public-safe
    // fields only — never notes / internal flags. Best-effort: failures don't
    // block the landing.
    try {
      const vendors = await directus.request(
        readItems("hoa_vendors", {
          filter: {
            _and: [
              { organization: { _eq: org.id } },
              { category: { _eq: "management" } },
              { status: { _eq: "active" } },
            ],
          },
          fields: ["company", "name", "email", "phone", "website", "address", "management_role"],
          sort: ["sort", "company"],
          limit: 1,
        })
      );
      org.property_manager = vendors?.[0] || null;
    } catch {
      org.property_manager = null;
    }

    return org;
  } catch (error: any) {
    // If it's already a createError, rethrow it
    if (error.statusCode) {
      throw error;
    }

    // Otherwise wrap it
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || "Failed to find organization",
    });
  }
});

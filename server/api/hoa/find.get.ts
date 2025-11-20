// server/api/hoa/find.get.ts
import { readItems } from "@directus/sdk";

export default defineEventHandler(async (event) => {
  const { domain, slug } = getQuery(event);

  if (!domain && !slug) {
    throw createError({
      statusCode: 400,
      message: "Domain or slug is required",
    });
  }

  const directus = getTypedDirectus();

  // Build filter - prioritize custom_domain, then slug
  const filters: any[] = [];

  if (domain) {
    // Check exact custom_domain match
    filters.push({ custom_domain: { _eq: domain as string } });
    // Also check slug as fallback (extract subdomain from domain)
    const potentialSlug = (domain as string).split(".")[0];
    filters.push({ slug: { _eq: potentialSlug } });
  }

  if (slug) {
    filters.push({ slug: { _eq: slug as string } });
  }

  try {
    const organizations = await directus.request(
      readItems("hoa_organizations", {
        filter: {
          _and: [{ _or: filters }, { status: { _eq: "published" } }],
        },
        fields: ["*", "amenities", "settings", "hero", "subscription_plan"],
        limit: 1,
        // Sort to prioritize custom_domain matches over slug matches
        sort: ["-custom_domain"],
      })
    );

    if (!organizations || organizations.length === 0) {
      throw createError({
        statusCode: 404,
        message: "Organization not found",
      });
    }

    return organizations[0];
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

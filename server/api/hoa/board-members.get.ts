// server/api/hoa/board-members.get.ts
import { readItems } from "@directus/sdk";

/**
 * Public API endpoint to fetch current board members for an organization
 * Returns only active board member terms (published status, within date range)
 */
export default defineEventHandler(async (event) => {
  const { slug, orgId } = getQuery(event);

  if (!slug && !orgId) {
    throw createError({
      statusCode: 400,
      message: "Organization slug or ID is required",
    });
  }

  const directus = getTypedDirectus();

  try {
    // First, find the organization
    let organizationId = orgId as string;

    if (slug && !orgId) {
      const orgs = await directus.request(
        readItems("hoa_organizations", {
          filter: {
            slug: { _eq: slug as string },
            status: { _in: ["active", "published"] },
          },
          fields: ["id"],
          limit: 1,
        })
      );

      if (!orgs || orgs.length === 0) {
        throw createError({
          statusCode: 404,
          message: "Organization not found",
        });
      }

      organizationId = orgs[0].id;
    }

    // Get current date for filtering active terms
    const now = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

    // Fetch board member terms with member info
    const boardTerms = await directus.request(
      readItems("hoa_board_member_terms", {
        filter: {
          _and: [
            { status: { _eq: "published" } },
            {
              hoa_member: {
                organization: { _eq: organizationId },
                status: { _eq: "active" },
              },
            },
            // Term has started (or no start date)
            {
              _or: [
                { term_start: { _lte: now } },
                { term_start: { _null: true } },
              ],
            },
            // Term hasn't ended (or no end date)
            {
              _or: [
                { term_end: { _gte: now } },
                { term_end: { _null: true } },
              ],
            },
          ],
        },
        fields: [
          "id",
          "title",
          "term_start",
          "term_end",
          "icon",
          "message",
          "hoa_member.id",
          "hoa_member.first_name",
          "hoa_member.last_name",
          "hoa_member.email",
        ],
        sort: ["sort"],
      })
    );

    // Sort by title priority
    const titlePriority: Record<string, number> = {
      president: 1,
      vice_president: 2,
      secretary: 3,
      treasurer: 4,
      director: 5,
    };

    const sortedTerms = [...(boardTerms || [])].sort((a, b) => {
      const priorityA = titlePriority[a.title || ""] || 99;
      const priorityB = titlePriority[b.title || ""] || 99;
      return priorityA - priorityB;
    });

    return {
      organizationId,
      boardMembers: sortedTerms,
    };
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || "Failed to fetch board members",
    });
  }
});

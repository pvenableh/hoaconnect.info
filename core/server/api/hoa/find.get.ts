// server/api/hoa/find.get.ts
//
// A community's public record by slug, with its management company, unit
// stats and announcement cadence — and, for a signed-in admin of THIS
// community, what the site builder edits. Every read is one readItemsBatch
// request: the reads after the community's own are filtered by its slug
// (unique) through their `organization` relation, so none waits for its id.
import type { HoaOrganization } from "#core/types/directus";
import type { BatchSpec } from "../../utils/directus-graphql";
import {
  PUBLIC_ORG_FIELD_PATHS,
  ORG_ADMIN_EXTRA_FIELD_PATHS,
  toPublicOrg,
  applyOrgAdminExtras,
  unitStatsFrom,
  announcementStatsFrom,
} from "../../utils/public-org";

type FindKey = "org" | "vendors" | "units" | "emails" | "mine" | "extras";

/** The reads, keyed: `extras` only for a signed-in caller, `mine` only for one who is not an App Administrator. */
function findSpecs(slug: string, userId: string, appAdmin: boolean): Partial<Record<FindKey, BatchSpec>> {
  const community = {
    _and: [
      { slug: { _eq: slug } },
      { status: { _in: ["active", "published"] as string[] as NonNullable<HoaOrganization["status"]>[] } },
    ],
  };
  const specs: Partial<Record<FindKey, BatchSpec>> = {
    // This answer is public: only what the public pages read (see
    // utils/public-org.ts), never "*".
    org: { collection: "hoa_organizations", filter: community, fields: PUBLIC_ORG_FIELD_PATHS, limit: 1 },
    // The primary management company (first active `management` vendor), so the
    // public landing can feature it when the admin opts in. Public-safe fields
    // only — never notes / internal flags.
    vendors: {
      collection: "hoa_vendors",
      filter: {
        _and: [{ organization: community }, { category: { _eq: "management" } }, { status: { _eq: "active" } }],
      },
      fields: ["company", "name", "email", "phone", "website", "address", "management_role"],
      sort: ["sort", "company"],
      limit: 1,
    },
    // Unit count + owner-occupancy for the building widget.
    units: {
      collection: "hoa_units",
      count: "*",
      groupBy: ["occupancy"],
      filter: { _and: [{ organization: community }, { status: { _neq: "archived" } }] },
      limit: -1,
    },
    // How much this community communicates: sent dates only, no subjects or bodies.
    emails: {
      collection: "hoa_emails",
      filter: {
        _and: [{ organization: community }, { status: { _eq: "sent" } }, { sent_at: { _nnull: true } }],
      },
      fields: ["sent_at"],
      sort: ["sent_at"],
      limit: -1,
    },
  };
  if (userId) {
    // checkAdminAccess's read: the caller's memberships here (adminFrom picks the first active or pending).
    if (!appAdmin) {
      specs.mine = {
        collection: "hoa_members",
        filter: { user: { _eq: userId }, organization: community },
        fields: ["id", "status", "role"],
        sort: ["id"],
        limit: -1,
      };
    }
    // Read for anyone signed in, returned only to this community's admin.
    specs.extras = { collection: "hoa_organizations", filter: community, fields: ORG_ADMIN_EXTRA_FIELD_PATHS, limit: 1 };
  }
  return specs;
}

/**
 * The batch, or — when it fails — each read on its own, so a failing extra
 * costs only its own section (as when they were separate reads). Only the
 * community's own read is required; a missing one is null.
 */
async function readFind(specs: Partial<Record<FindKey, BatchSpec>>): Promise<Partial<Record<FindKey, any[] | null>>> {
  try {
    return await readItemsBatch(specs as Record<FindKey, BatchSpec>);
  } catch {
    const keys = Object.keys(specs) as FindKey[];
    const rows = await Promise.all(
      keys.map(async (k) => {
        try {
          return (await readItemsBatchRest({ [k]: specs[k]! }))[k];
        } catch (e) {
          if (k === "org") throw e;
          return null;
        }
      })
    );
    return Object.fromEntries(keys.map((k, i) => [k, rows[i]]));
  }
}

export default defineEventHandler(async (event) => {
  const { slug } = getQuery(event);

  if (!slug) {
    throw createError({
      statusCode: 400,
      message: "Slug is required",
    });
  }

  // The route is public: a failing session lookup means a visitor, not an error.
  const session = await getUserSession(event).catch(() => null);
  const userId = session?.user?.id ? String(session.user.id) : "";
  const appAdmin = !!userId && isAppAdminSession(session);

  try {
    const rows = await readFind(findSpecs(slug as string, userId, appAdmin));

    const found = rows.org?.[0];
    if (!found) {
      throw createError({
        statusCode: 404,
        message: "Organization not found",
      });
    }

    const org = toPublicOrg(found as Record<string, any>);

    // The site builder (an admin page) loads through this route too, and it
    // edits two things the public must not see: the library folder its uploads
    // go into and the inquiry recipient. Only a signed-in admin of THIS
    // community gets them, and that answer is never cached.
    const isAdmin =
      !!userId && (appAdmin || (!!rows.mine && adminFrom({ userId, orgId: org.id, mine: rows.mine }, accessRoles()).isAdmin));
    if (isAdmin) {
      // Answering an admin with the redacted landing would let the site
      // builder save it back and lose the inquiry recipient.
      if (!rows.extras) throw createError({ statusCode: 500, message: "Failed to read the community's admin fields" });
      applyOrgAdminExtras(org, rows.extras[0]);
      setResponseHeader(event, "cache-control", "private, no-store");
    }

    // Best-effort: a failed read is a missing section, never a missing landing.
    org.property_manager = rows.vendors ? rows.vendors[0] || null : null;
    org.unit_stats = rows.units ? unitStatsFrom(rows.units) : null;
    org.announcement_stats = rows.emails ? announcementStatsFrom(rows.emails) : null;

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

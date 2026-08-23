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

    // Unit count + owner-occupancy for the building widget. The reference site
    // leads with "28 / UNITS · 18 owner-occupied · 64% ownership", and a unit
    // count is a truer description of a building than the denormalized
    // `member_count` the widget used to read — that counts people, drifts
    // whenever a member record changes, and said "1 household" for a 28-unit
    // building. Best-effort: a failure here must not take the landing down.
    try {
      const units = await directus.request(
        readItems("hoa_units", {
          filter: {
            _and: [{ organization: { _eq: org.id } }, { status: { _neq: "archived" } }],
          },
          fields: ["occupancy"],
          limit: -1,
        })
      );
      const total = units?.length || 0;
      const ownerOccupied = (units || []).filter((u: any) => u.occupancy === "owner").length;
      org.unit_stats = total
        ? {
            total,
            owner_occupied: ownerOccupied,
            // Only meaningful once somebody has actually recorded occupancy.
            ownership_pct: ownerOccupied ? Math.round((ownerOccupied / total) * 100) : null,
          }
        : null;
    } catch {
      org.unit_stats = null;
    }

    // How much this community actually communicates: how many notices have gone
    // out, since when, and roughly how often. A count and a cadence only — no
    // subject lines, no bodies, nothing a visitor could read. Best-effort.
    try {
      const emails = await directus.request(
        readItems("hoa_emails", {
          filter: {
            _and: [
              { organization: { _eq: org.id } },
              { status: { _eq: "sent" } },
              { sent_at: { _nnull: true } },
            ],
          },
          fields: ["sent_at"],
          sort: ["sent_at"],
          limit: -1,
        })
      );
      const sent = (emails || [])
        .map((e: any) => (e.sent_at ? new Date(e.sent_at) : null))
        .filter((d: Date | null): d is Date => !!d && !Number.isNaN(d.getTime()));

      if (sent.length) {
        const first = sent[0]!;
        const last = sent[sent.length - 1]!;
        // Inclusive month span, so a single month reads as 1 rather than 0 and
        // the average never divides by zero.
        const months = Math.max(
          1,
          (last.getFullYear() - first.getFullYear()) * 12 +
            (last.getMonth() - first.getMonth()) +
            1
        );
        org.announcement_stats = {
          total: sent.length,
          since: first.toISOString(),
          avg_per_month: Math.round((sent.length / months) * 10) / 10,
        };
      } else {
        org.announcement_stats = null;
      }
    } catch {
      org.announcement_stats = null;
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

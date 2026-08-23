// server/api/hoa/announcements.get.ts
// Recent publicly-shown announcements for an org's landing teaser. Privacy-safe:
// returns [] unless the admin opted in (settings.landing.show_announcements) —
// internal resident comms are never exposed by default. Only "sent" emails that
// are marked PUBLIC, have a web_slug and carry an announcement-style type are
// returned. (The visibility check was added with the field; before it, a private
// email that happened to have a web slug would have appeared here.)
import { readItems } from "@directus/sdk";
import type { HoaOrganization } from "#core/types/directus";
import { normalizeLandingConfig } from "#core/shared/utils/landing";

export default defineEventHandler(async (event) => {
  const { slug, limit } = getQuery(event);
  if (!slug) throw createError({ statusCode: 400, message: "slug is required" });

  const directus = getTypedDirectus();
  const orgs = await directus.request(
    readItems("hoa_organizations", {
      filter: { slug: { _eq: slug as string }, status: { _in: ["active", "published"] as string[] as NonNullable<HoaOrganization["status"]>[] } },
      fields: ["id", { settings: ["landing"] }],
      limit: 1,
    })
  );
  const org: any = orgs?.[0];
  if (!org) return [];

  const cfg = normalizeLandingConfig(
    org.settings && typeof org.settings === "object" ? org.settings.landing : null
  );
  if (!cfg.show_announcements) return []; // opt-in only

  const n = Math.min(Number(limit) || 4, 10);
  const items = await directus.request(
    readItems("hoa_emails", {
      filter: {
        organization: { _eq: org.id },
        status: { _eq: "sent" },
        web_slug: { _nnull: true },
        email_type: { _in: ["announcement", "newsletter", "notice"] },
        // A private email is one written for specific residents. Having a web
        // slug did not make it community news, and this route is the PUBLIC
        // landing teaser — anyone at all can read what it returns.
        visibility: { _eq: "public" },
      },
      fields: ["id", "subject", "subtitle", "sent_at", "web_slug"],
      sort: ["-sent_at"],
      limit: n,
    })
  );
  return items;
});

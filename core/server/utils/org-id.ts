/**
 * Resolve the organization a request is about, from a slug or an id.
 *
 * Every org-scoped surface under `/{slug}/` hits the same trap: the client's
 * *selected* org is a stored preference, and it resets to the user's first
 * membership on a hard navigation. A page opened from a bookmark, a link in an
 * email, or a browser reload therefore asks about a DIFFERENT community than
 * the one in the URL — and gets a plausible, empty, wrong answer rather than an
 * error. `/api/org/ledger` takes a slug for exactly this reason; anything else
 * reachable by URL should too.
 *
 * Prefers `orgId` when both are given: a caller holding an id has already
 * resolved it.
 */

import { readItems } from "@directus/sdk";

export async function resolveOrgId(input: {
  orgId?: unknown;
  slug?: unknown;
}): Promise<string> {
  const orgId = String(input.orgId ?? "").trim();
  if (orgId) return orgId;

  const slug = String(input.slug ?? "").trim();
  if (!slug) return "";

  const rows = (await getTypedDirectus().request(
    readItems("hoa_organizations", {
      filter: { slug: { _eq: slug } },
      fields: ["id"] as any,
      limit: 1,
    })
  )) as any[];
  return String(rows?.[0]?.id ?? "");
}

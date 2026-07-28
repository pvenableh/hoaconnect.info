// Brand / location / amenities grounding for the AI assistant. This is the
// association's IDENTITY layer — who they are, where they are, what they offer,
// who's on the board — pulled from the same sources the public landing renders:
//   - org profile + settings.description  (positioning / about)
//   - settings.landing.location           (walkability, neighborhood highlights)
//   - hoa_amenities rows                   (amenities)
//   - hoa_board_members (via hoa_member)   (leadership roster)
//
// Appended to the cached org-context block (via gatherOrgContext), so every
// conversation is grounded in brand knowledge and it caches with the rest. Pure
// best-effort — each section degrades to omitted rather than throwing.
//
// getTypedDirectus is auto-imported from server/utils/directus.ts.

import { readItem, readItems } from "@directus/sdk";

function clip(s: unknown, max = 160): string {
  const t = String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/**
 * Build the brand/location/amenities/board block, or null if nothing surfaced.
 * Sections are independent — a failure omits that section only.
 */
export async function getBrandContext(orgId: string): Promise<string | null> {
  const directus = getTypedDirectus();
  const lines: string[] = [];

  // ── Location / positioning (org + settings.landing.location) ───────────────
  try {
    const org = (await directus.request(
      readItem("hoa_organizations", orgId, {
        fields: [
          "type",
          "street_address",
          "city",
          "state",
          "zip",
          { settings: ["title", "description", "theme", "landing"] },
        ],
      })
    )) as any;
    const settings = org?.settings || {};
    const landing = settings.landing || {};
    const loc = landing.location || {};

    const positioning = settings.title || "";
    if (positioning) lines.push(`Positioning: ${clip(positioning, 160)} [Source: Brand]`);
    if (settings.theme) lines.push(`Brand theme: ${settings.theme}`);

    const where = [org?.street_address, org?.city, org?.state, org?.zip].filter(Boolean).join(", ");
    if (where) lines.push(`Address: ${clip(where, 140)}`);

    const scores = [
      loc.walk_score != null ? `Walk ${loc.walk_score}` : "",
      loc.bike_score != null ? `Bike ${loc.bike_score}` : "",
      loc.transit_score != null ? `Transit ${loc.transit_score}` : "",
    ].filter(Boolean);
    if (scores.length) lines.push(`Location scores: ${scores.join(" · ")} [Source: Location]`);
    if (loc.intro) lines.push(`Neighborhood: ${clip(loc.intro, 200)}`);
    if (Array.isArray(loc.highlights) && loc.highlights.length) {
      const hi = loc.highlights
        .slice(0, 6)
        .map((h: any) => clip([h.name, h.walk_time].filter(Boolean).join(" – "), 40))
        .filter(Boolean);
      if (hi.length) lines.push(`Nearby: ${hi.join("; ")}`);
    }
  } catch {
    /* location/positioning unavailable — non-fatal */
  }

  // ── Amenities (hoa_amenities rows) ─────────────────────────────────────────
  try {
    const amenities = (await directus.request(
      readItems("hoa_amenities", {
        filter: { organization: { _eq: orgId } },
        fields: ["title", "description"],
        limit: 20,
      })
    )) as { title?: string | null; description?: string | null }[];
    const named = amenities?.filter((a) => a.title);
    if (named?.length) {
      lines.push("", "Amenities [Source: Amenities]:");
      for (const a of named) {
        lines.push(`- ${clip(a.title, 60)}${a.description ? ` — ${clip(a.description, 80)}` : ""}`);
      }
    }
  } catch {
    /* amenities unavailable — non-fatal */
  }

  // ── Board roster (hoa_board_members via hoa_member → org) ──────────────────
  try {
    const board = (await directus.request(
      readItems("hoa_board_members", {
        filter: {
          status: { _eq: "published" },
          hoa_member: { organization: { _eq: orgId } },
        },
        fields: ["title", { hoa_member: ["first_name", "last_name"] }],
        sort: ["title"],
        limit: 12,
      })
    )) as any[];
    const named = board?.filter((b) => b.hoa_member?.first_name || b.hoa_member?.last_name);
    if (named?.length) {
      lines.push("", "Board [Source: Board]:");
      for (const b of named) {
        const who = [b.hoa_member?.first_name, b.hoa_member?.last_name].filter(Boolean).join(" ");
        lines.push(`- ${b.title ? `${b.title}: ` : ""}${clip(who, 50)}`);
      }
    }
  } catch {
    /* board unavailable — non-fatal */
  }

  if (!lines.length) return null;
  return ["Association identity (brand, location, amenities, leadership):", "", ...lines].join("\n");
}

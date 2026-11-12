// server/utils/public-org.ts
// What a community's record says to someone who is not signed in.
//
// GET /api/hoa/find and /api/hoa/by-slug answer anyone who knows a slug. They
// used to read `hoa_organizations` with "*" (and settings.*, hero.*, …), which
// handed every visitor the Stripe customer / subscription / Connect ids, the
// billing account, dues and late-fee settings, payment instructions, inquiry
// routing, the library root folder, user_created/user_updated, and every
// block_settings column (from_email, the SendGrid domain and its DNS, reminder
// settings…). This is the list of what the public readers actually read; a
// field joins it only when a page that renders without a session needs it.
//
// Who reads it (trace these before adding or removing anything):
//  - the public landing: app/pages/[slug]/index.vue, app/pages/index.vue,
//    app/components/Org/PublicLanding.vue and Org/Landing/* (+ useLandingNav);
//  - [slug]/request-join, [slug]/signup, [slug]/board: id, name, logo;
//  - useActiveHoa → Nav, AuthShell, useOrgBranding (head/favicon), useModules
//    (`modules`), useChannelAccess / useCurrentDomainAccess / payments (`id`);
//  - the admin site preview, which renders the same landing.
//
// Kept although they describe the account rather than the community, because
// the landing decides what to show from them: `is_free_account` and
// `subscription_status` (the "This account has expired" hero), `maintenance_mode`
// ("under construction"), `modules` (which locked portal links the public nav
// lists), `show_board`, `external_url` (send visitors to the community's own site).
//
// `settings.id` and `hero.id` are row keys, not content: a key lets nobody read a
// row Directus would not already show them (the public role reads neither table).
// They stay public because the site builder saves onto them, and if its admin
// check ever disagreed with the server's, a missing `settings.id` would make it
// create a blank settings row and point the community at it — dropping its
// logo, colours and email sender setup.
import type { H3Event } from "h3";
import { readItem } from "@directus/sdk";
import type { QueryFields } from "@directus/sdk";
import type { Schema, HoaOrganization } from "#core/types/directus";

export const PUBLIC_ORG_FIELDS = [
  "id",
  "slug",
  "name",
  "type",
  "street_address",
  "city",
  "state",
  "zip",
  "phone",
  "email",
  "member_count",
  "show_board",
  "maintenance_mode",
  "modules",
  "external_url",
  "is_free_account",
  "subscription_status",
  {
    logo: ["id"],
    amenities: ["id", "title", "icon", "description"],
    hero: ["id", "title", "subtitle", { background_image: ["id"], foreground_image: ["id"] }],
    // Never "*" here: block_settings also holds the email sender (from_email,
    // email_domain, its DNS), reminder settings and the email footer.
    settings: [
      "id",
      "title",
      "description",
      "theme",
      "colors",
      "seo",
      "landing",
      { logo: ["id", "type"], icon: ["id"] },
    ],
  },
] as QueryFields<Schema, HoaOrganization>;

/**
 * What only an admin of the community gets on top of the public shape — the
 * site builder (app/components/pages/LandingBuilderPage.vue) reads them:
 *  - `folder`, the library root its image uploads go into;
 *  - `settings.landing` as stored, i.e. with the inquiry recipient it edits.
 */
export const ORG_ADMIN_EXTRA_FIELDS = ["folder", { settings: ["landing"] }] as QueryFields<
  Schema,
  HoaOrganization
>;

/**
 * settings.landing is one JSON column, so Directus cannot leave part of it out.
 * Everything in it is page content the landing renders, except who receives the
 * inquiry form: `inquiry.email` (an address) or `inquiry.user` (a user id). The
 * landing reads only `inquiry.enabled`; the inquiry route looks the recipient
 * up on the server.
 */
export function redactLandingForPublic(landing: unknown): unknown {
  if (landing == null) return landing;
  // The landing treats anything that isn't an object as "use the defaults".
  if (typeof landing !== "object" || Array.isArray(landing)) return null;
  const { inquiry, ...rest } = landing as Record<string, any>;
  if (inquiry === undefined) return rest;
  return {
    ...rest,
    inquiry: inquiry && typeof inquiry === "object" ? { enabled: inquiry.enabled } : inquiry,
  };
}

/** The public shape of a row read with PUBLIC_ORG_FIELDS. */
export function toPublicOrg<T extends Record<string, any>>(org: T): T {
  const settings = org?.settings;
  if (!settings || typeof settings !== "object" || !("landing" in settings)) return org;
  return { ...org, settings: { ...settings, landing: redactLandingForPublic(settings.landing) } };
}

/**
 * Is the caller a signed-in admin of this community? Never throws and never
 * requires a session — the routes stay public; a visitor is simply not an admin.
 */
export async function isOrgAdminCaller(event: H3Event, organizationId: string): Promise<boolean> {
  if (!organizationId) return false;
  try {
    const session = await getUserSession(event);
    if (!session?.user?.id) return false;
    const access = await checkAdminAccess(event, organizationId);
    return access?.isAdmin === true;
  } catch {
    return false;
  }
}

/**
 * Put the admin-only fields onto a public-shaped org (mutates it). Throws if the
 * read fails: answering an admin with the redacted landing would let the site
 * builder save it back and lose the inquiry recipient.
 */
export async function attachOrgAdminExtras(
  directus: ReturnType<typeof getTypedDirectus>,
  org: Record<string, any>
): Promise<void> {
  const extra = (await directus.request(
    readItem("hoa_organizations", org.id, { fields: ORG_ADMIN_EXTRA_FIELDS })
  )) as Record<string, any> | null;
  if (!extra) return;
  org.folder = extra.folder ?? null;
  const extraSettings = extra.settings;
  if (extraSettings && typeof extraSettings === "object") {
    org.settings = {
      ...(org.settings && typeof org.settings === "object" ? org.settings : {}),
      landing: extraSettings.landing ?? null,
    };
  }
  // The site builder saves only an answer carrying this: anything else has the
  // public, redacted landing, and saving it would erase the inquiry recipient.
  org.admin_view = true;
}

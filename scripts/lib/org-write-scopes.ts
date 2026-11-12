/**
 * Scopes for the write permissions that were `{}` (any row of any community).
 * Written by `scripts/scope-org-writes.ts`; reviewed 2026-11-11.
 *
 * Every signed-in user can get their own Directus token (`/api/websocket/token`)
 * and the HOA policies have app access, so a policy is the real boundary. The
 * unrestricted update and delete rights were:
 *
 *   folders (HOA Member update and delete, HOA Admin delete): any folder of any
 *     community, roots included. Now: folders below one of the user's
 *     community roots (up to four levels), never a root.
 *   block_hero (HOA Admin update and delete): the landing-page hero of any
 *     community, and the platform's own. Now: the hero of one of the user's
 *     communities, through a reverse alias `block_hero.hoa_organizations`
 *     (of `hoa_organizations.hero`; metadata only).
 *   dashboards and panels (both policies, update and delete): any Insights
 *     dashboard. None exist and the app does not use them. Now: the user's own.
 *
 * Only `$CURRENT_USER.hoa_members.organization` is used, never `.folder`
 * (see folder-org-filters.ts for why mixing the two breaks reads).
 *
 * Create rights are left as they are. A create is checked against a payload
 * validation, which cannot follow a relation, so "only into your own
 * community's folder" cannot be said there; see the residual note in
 * docs/prompts/governing-loose-ends.md.
 */
import { FOLDER_OF_MY_ORG, ORG_PATH } from "./folder-org-filters";

export const HERO_ORG_ALIAS = "hoa_organizations";

/** A folder below one of the user's community roots, up to four levels; never a root itself. */
export const BELOW_MY_COMMUNITY_ROOT = {
  _or: [
    { parent: FOLDER_OF_MY_ORG },
    { parent: { parent: FOLDER_OF_MY_ORG } },
    { parent: { parent: { parent: FOLDER_OF_MY_ORG } } },
    { parent: { parent: { parent: { parent: FOLDER_OF_MY_ORG } } } },
  ],
};
export const HERO_OF_MY_COMMUNITY = { [HERO_ORG_ALIAS]: { id: { _in: ORG_PATH } } };
export const MY_OWN = { user_created: { _eq: "$CURRENT_USER" } };

/** policy name → collection → action → the filter it should have. */
export const ORG_WRITE_SCOPES: Record<string, Record<string, Record<string, unknown>>> = {
  "HOA Member": {
    directus_folders: { update: BELOW_MY_COMMUNITY_ROOT, delete: BELOW_MY_COMMUNITY_ROOT },
    directus_dashboards: { update: MY_OWN, delete: MY_OWN },
    directus_panels: { update: MY_OWN, delete: MY_OWN },
  },
  "HOA Admin": {
    directus_folders: { delete: BELOW_MY_COMMUNITY_ROOT },
    block_hero: { update: HERO_OF_MY_COMMUNITY, delete: HERO_OF_MY_COMMUNITY },
    directus_dashboards: { update: MY_OWN, delete: MY_OWN },
    directus_panels: { update: MY_OWN, delete: MY_OWN },
  },
};

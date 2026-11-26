// The block-builder's library read (GET /api/email/blocks), as a batch spec so
// it can ride with the caller's standing in one Directus request.
import type { ReadSpec } from "./directus-graphql";

/** Every platform (is_system) block plus the org's own, in palette order. */
export function blockLibrarySpec(orgId: string): ReadSpec {
  return {
    collection: "hoa_newsletter_blocks",
    filter: {
      _or: [{ is_system: { _eq: true } }, { organization: { _eq: orgId } }],
    },
    fields: [
      "id", "name", "slug", "description", "category",
      "mjml_source", "variables_schema", "is_system", "sort",
    ],
    sort: ["category", "sort", "name"],
    limit: 200,
  };
}

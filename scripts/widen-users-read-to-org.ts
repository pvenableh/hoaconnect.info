/**
 * Let people see the names of people they share a community with.
 *
 * ## The problem
 *
 * Every app policy scoped `directus_users` read to `{ id: { _eq: "$CURRENT_USER.id" } }`
 * — you could read exactly one user, yourself. Two visible consequences:
 *
 *   1. The @-mention picker is permanently empty. It filters channel members on
 *      `m.user`, and `hoa_members.user` expands to `null` for everyone but you,
 *      so it always renders "No users found".
 *   2. Every message, comment and audit line written by anybody else renders as
 *      **"Unknown User"**.
 *
 * ## The change
 *
 * A SECOND read rule per policy, matching people who share an organisation:
 *
 *     permissions: { hoa_members: { organization: { _in: "$CURRENT_USER.hoa_members.organization" } } }
 *     fields:      ["id", "first_name", "last_name", "avatar"]
 *
 * The existing self rule is left exactly as it is, which is what keeps this
 * safe. Directus 11 applies field permissions **per matching rule**, not as a
 * union across rules: a row matched only by the org rule is returned with the
 * other four fields and `email`, `role`, `status`, `provider`, `password`,
 * `tfa_secret` all `null`, while your own row still comes back complete through
 * the self rule. Verified against this Directus (11.13.4) before this script was
 * written — `token`, `last_access` and `external_identifier` are refused
 * outright, the rest null.
 *
 * Scope is `hoa_members` membership, so it reaches exactly as far as the
 * community someone belongs to and no further. It is additive: nothing that
 * worked before changes.
 *
 * Idempotent: the org rule is identified by its filter, and PATCHed rather than
 * duplicated on a re-run.
 *
 * Run with: pnpm widen:users-read
 * Requires: DIRECTUS_URL, DIRECTUS_STATIC_TOKEN (admin token).
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing required environment variables:");
  console.error("   - DIRECTUS_URL");
  console.error("   - DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

/** Policies that represent a signed-in person in the app. */
const APP_POLICIES = ["HOA Admin", "HOA Member", "Property Manager Policy"];

/** Who the widened rule matches: anyone sharing one of my organisations. */
const SHARES_AN_ORG = {
  hoa_members: { organization: { _in: "$CURRENT_USER.hoa_members.organization" } },
};

/** What it exposes about them — a name and a face, nothing else. */
const PUBLIC_FIELDS = ["id", "first_name", "last_name", "avatar"];

async function directusFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
      ...options.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function main(): Promise<void> {
  console.log("🚀 Widening directus_users read to same-organisation people...");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);

  try {
    const policiesRes = await directusFetch(
      `/policies?filter=${encodeURIComponent(
        JSON.stringify({ name: { _in: APP_POLICIES } })
      )}&fields=id,name&limit=-1`
    );
    const policies = (policiesRes.data ?? []) as Array<{ id: string; name: string }>;

    if (!policies.length) {
      console.log("\n⚠️  None of the app policies were found — nothing to do.");
      return;
    }

    for (const policy of policies) {
      const existingRes = await directusFetch(
        `/permissions?filter=${encodeURIComponent(
          JSON.stringify({
            policy: { _eq: policy.id },
            collection: { _eq: "directus_users" },
            action: { _eq: "read" },
          })
        )}&fields=id,permissions,fields&limit=-1`
      );
      const rows = (existingRes.data ?? []) as Array<{
        id: number;
        permissions: any;
        fields: string[] | null;
      }>;

      // The self rule is whatever is NOT the org rule; leave it untouched.
      const orgRule = rows.find(
        (r) => JSON.stringify(r.permissions) === JSON.stringify(SHARES_AN_ORG)
      );

      const body = {
        permissions: SHARES_AN_ORG,
        validation: null,
        fields: PUBLIC_FIELDS,
      };

      if (orgRule) {
        if (JSON.stringify(orgRule.fields) === JSON.stringify(PUBLIC_FIELDS)) {
          console.log(`   ⏭️  ${policy.name} (already widened)`);
          continue;
        }
        await directusFetch(`/permissions/${orgRule.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        console.log(`   ✏️  ${policy.name} (field list corrected)`);
      } else {
        await directusFetch(`/permissions`, {
          method: "POST",
          body: JSON.stringify({
            policy: policy.id,
            collection: "directus_users",
            action: "read",
            ...body,
          }),
        });
        const selfRules = rows.length;
        console.log(
          `   ➕ ${policy.name} (added alongside ${selfRules} existing read rule${
            selfRules === 1 ? "" : "s"
          })`
        );
      }
    }

    console.log("\n✅ Done. Mentions can find people and authors have names.");
  } catch (error: any) {
    console.error("\n❌ Failed:", error.message);
    process.exit(1);
  }
}

main();

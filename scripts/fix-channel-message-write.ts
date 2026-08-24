/**
 * Fix channel writes — `hoa_channel_messages.create` was broken for every role.
 *
 * ## The bug
 *
 * Both app policies carried the org check as create *validation*:
 *
 *     validation: { channel: { organization: { _in: "$CURRENT_USER.hoa_members.organization" } } }
 *
 * On create Directus evaluates validation against the submitted **payload**, and
 * the payload's `channel` is a bare uuid — there is no `channel.organization` in
 * it to traverse. Directus therefore reports the nested key as a missing
 * required field and every send fails with
 * `Validation failed for field "channel". Value is required.`
 * Only the static admin token got through, because it bypasses validation
 * entirely; that is why messages could be seeded out-of-band while nobody could
 * actually post one.
 *
 * ## Why the obvious fix is wrong
 *
 * "Move it to `permissions`" does not work: **Directus 11 ignores `permissions`
 * on the `create` action** (there is no row yet to filter). Verified against
 * this Directus, 11.13.4 — with the org rule moved to `permissions`, a user
 * successfully created a message in a channel belonging to an organisation they
 * are not a member of. That is a cross-org write hole, so the rule has to stay
 * in `validation` and simply be written in a form Directus can evaluate against
 * a payload.
 *
 * ## The fix
 *
 * Validate the payload's `channel` **scalar** against a dynamic list of the
 * caller's own channel ids:
 *
 *     validation: { channel: { _in: "$CURRENT_USER.channel_memberships.channel" } }
 *
 * `$CURRENT_USER.channel_memberships` needs a reverse O2M alias on
 * `directus_users` before Directus can resolve it — the same prerequisite that
 * `hoa_members` already satisfies for the org filter, and the same one
 * `restrict-channel-access.ts` established for `hoa_channels.channel_members`.
 * Step 1 below creates it.
 *
 * This is *membership*-scoped rather than org-scoped, which is tighter than what
 * was intended and matches the model channels already use: the
 * `hoa_channel_members` row IS the grant. Nobody loses the ability to post,
 * because opening a channel auto-joins — `ChannelThread.openChannel()` awaits
 * `markRead()`, which POSTs `/api/hoa/channels/:channel/read`, which creates the
 * row for anyone with org-wide access before the composer is usable.
 *
 * `hoa_channel_mentions.create` carried the identical broken filter and is fixed
 * the same way; HOA Member had no create row for it at all (so a member's
 * @-mention silently wrote nothing), and gets one here.
 *
 * `update` is deliberately untouched: it carries the same traversal but works,
 * because an update has an existing row to resolve against.
 *
 * Idempotent: re-runnable, PATCHes in place, skips the alias if present.
 *
 * Run with: pnpm fix:channel-writes
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

/** The one rule this script exists to install. */
const MEMBERSHIP_SCOPED_CREATE = {
  channel: { _in: "$CURRENT_USER.channel_memberships.channel" },
};

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

// ── 1. Reverse O2M alias on directus_users ────────────────────────────────────
async function ensureChannelMembershipsAlias(): Promise<void> {
  console.log("\n🔗 Ensuring directus_users.channel_memberships O2M alias...");

  let exists = false;
  try {
    await directusFetch(`/fields/directus_users/channel_memberships`);
    exists = true;
  } catch {
    exists = false;
  }

  if (!exists) {
    await directusFetch(`/fields/directus_users`, {
      method: "POST",
      body: JSON.stringify({
        field: "channel_memberships",
        type: "alias",
        meta: {
          interface: "list-o2m",
          special: ["o2m"],
          hidden: true,
          note: "Channels this user belongs to. Exists so permission filters can resolve $CURRENT_USER.channel_memberships.channel.",
        },
      }),
    });
    console.log("   ✅ Created alias directus_users.channel_memberships");
  } else {
    console.log("   ⏭️  Alias directus_users.channel_memberships already exists");
  }

  // Without one_field the alias is inert — Directus cannot resolve the O2M in a
  // filter. This is the step whose absence has cost this project time before.
  await directusFetch(`/relations/hoa_channel_members/user`, {
    method: "PATCH",
    body: JSON.stringify({ meta: { one_field: "channel_memberships" } }),
  });
  console.log("   ✅ Linked hoa_channel_members.user → one_field channel_memberships");
}

// ── 2. Rewrite the create rules ───────────────────────────────────────────────
type PolicyRef = { id: string; name: string };

async function appPolicies(): Promise<PolicyRef[]> {
  const res = await directusFetch(
    `/policies?filter=${encodeURIComponent(
      JSON.stringify({ name: { _in: ["HOA Admin", "HOA Member"] } })
    )}&fields=id,name&limit=-1`
  );
  return (res.data ?? []) as PolicyRef[];
}

async function fixCreateRule(policy: PolicyRef, collection: string): Promise<void> {
  const existingRes = await directusFetch(
    `/permissions?filter=${encodeURIComponent(
      JSON.stringify({
        policy: { _eq: policy.id },
        collection: { _eq: collection },
        action: { _eq: "create" },
      })
    )}&fields=id,validation&limit=1`
  );
  const existing = existingRes.data?.[0];

  const body = {
    permissions: {},
    validation: MEMBERSHIP_SCOPED_CREATE,
    fields: ["*"],
  };

  if (existing) {
    if (JSON.stringify(existing.validation) === JSON.stringify(MEMBERSHIP_SCOPED_CREATE)) {
      console.log(`      ⏭️  ${policy.name} · ${collection}.create (already correct)`);
      return;
    }
    await directusFetch(`/permissions/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    console.log(`      ✏️  ${policy.name} · ${collection}.create (rewritten)`);
  } else {
    await directusFetch(`/permissions`, {
      method: "POST",
      body: JSON.stringify({ policy: policy.id, collection, action: "create", ...body }),
    });
    console.log(`      ➕ ${policy.name} · ${collection}.create (created)`);
  }
}

async function main(): Promise<void> {
  console.log("🚀 Fixing channel write permissions...");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    await ensureChannelMembershipsAlias();

    const policies = await appPolicies();
    if (!policies.length) {
      console.log("\n⚠️  Neither 'HOA Admin' nor 'HOA Member' policy found — nothing to do.");
      return;
    }

    console.log("\n🔐 Rewriting create rules to be payload-evaluable...");
    for (const policy of policies) {
      for (const collection of ["hoa_channel_messages", "hoa_channel_mentions"]) {
        await fixCreateRule(policy, collection);
      }
    }

    console.log("\n✅ Done. Channels are writable. Run `pnpm generate:types` if the");
    console.log("   alias is the first change to directus_users in your local types.");
  } catch (error: any) {
    console.error("\n❌ Failed:", error.message);
    process.exit(1);
  }
}

main();

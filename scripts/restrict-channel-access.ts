/**
 * Phase 8, Track A — restrict channel access to a membership-scoped model.
 *
 * The original channels migration gave the HOA Member role ORG-WIDE read access
 * to all channels/messages. Channels are now an internal admin/board tool, so a
 * member must only see channels they belong to (a hoa_channel_members row). This
 * script:
 *
 *   1. Adds a reverse O2M alias `channel_members` on hoa_channels (required so
 *      permission filters can traverse channels → members).
 *   2. Rewrites the HOA Member policy's read/create filters to be
 *      membership-scoped. Admins keep their org-wide policy (untouched).
 *
 * Idempotent: re-runnable. Existing permissions are PATCHed in place (not
 * duplicated); the alias field is skipped if present.
 *
 * Run with: pnpm tsx scripts/restrict-channel-access.ts
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
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }
  // 204 No Content (PATCH/DELETE) has no body.
  if (response.status === 204) return null;
  return response.json();
}

// ── 1. Reverse O2M alias on hoa_channels ───────────────────────────────────────
async function ensureChannelMembersAlias(): Promise<void> {
  console.log("\n🔗 Ensuring hoa_channels.channel_members O2M alias...");

  let fieldExists = false;
  try {
    await directusFetch(`/fields/hoa_channels/channel_members`);
    fieldExists = true;
  } catch {
    fieldExists = false;
  }

  if (!fieldExists) {
    await directusFetch(`/fields/hoa_channels`, {
      method: "POST",
      body: JSON.stringify({
        field: "channel_members",
        type: "alias",
        meta: {
          interface: "list-o2m",
          special: ["o2m"],
          note: "Members enrolled in / invited to this channel.",
        },
      }),
    });
    console.log("   ✅ Created alias field hoa_channels.channel_members");
  } else {
    console.log("   ⏭️  Alias field hoa_channels.channel_members already exists");
  }

  // Point the existing hoa_channel_members.channel relation back at the alias so
  // Directus can resolve the O2M in filters.
  try {
    await directusFetch(`/relations/hoa_channel_members/channel`, {
      method: "PATCH",
      body: JSON.stringify({ meta: { one_field: "channel_members" } }),
    });
    console.log("   ✅ Linked relation hoa_channel_members.channel → one_field channel_members");
  } catch (error: any) {
    console.log(`   ⚠️  Could not patch relation one_field: ${error.message}`);
  }
}

// ── 2. Membership-scoped HOA Member permissions ────────────────────────────────
async function getMemberPolicyId(): Promise<string | null> {
  const rolesRes = await directusFetch(
    `/roles?filter=${JSON.stringify({ name: { _eq: "HOA Member" } })}&fields=id,name&limit=1`
  );
  const role = rolesRes.data?.[0];
  if (!role) {
    console.log("   ⚠️  HOA Member role not found.");
    return null;
  }
  const accessRes = await directusFetch(
    `/access?filter=${JSON.stringify({ role: { _eq: role.id } })}&fields=id,policy&limit=1`
  );
  const entry = accessRes.data?.[0];
  const policyId = typeof entry?.policy === "string" ? entry.policy : entry?.policy?.id;
  return policyId || null;
}

async function upsertPermission(
  policyId: string,
  collection: string,
  action: string,
  config: { permissions: any; validation: any; fields: string[] }
): Promise<void> {
  const existingRes = await directusFetch(
    `/permissions?filter=${JSON.stringify({
      policy: { _eq: policyId },
      collection: { _eq: collection },
      action: { _eq: action },
    })}&fields=id&limit=1`
  );
  const existing = existingRes.data?.[0];

  if (existing) {
    await directusFetch(`/permissions/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify(config),
    });
    console.log(`      ✏️  ${collection}.${action} (updated)`);
  } else {
    await directusFetch(`/permissions`, {
      method: "POST",
      body: JSON.stringify({ policy: policyId, collection, action, ...config }),
    });
    console.log(`      ➕ ${collection}.${action} (created)`);
  }
}

async function restrictMemberPermissions(): Promise<void> {
  console.log("\n🔐 Narrowing HOA Member permissions to membership scope...");

  const policyId = await getMemberPolicyId();
  if (!policyId) {
    console.log("   ⚠️  No HOA Member policy found — skipping permission changes.");
    return;
  }
  console.log(`   ✅ HOA Member policy: ${policyId}`);

  // Channels the user is a member of.
  const memberChannelFilter = {
    channel_members: { user: { _eq: "$CURRENT_USER" } },
  };
  // Rows whose channel the user is a member of (messages, members).
  const memberViaChannelFilter = {
    channel: { channel_members: { user: { _eq: "$CURRENT_USER" } } },
  };
  const ownMessageFilter = { user_created: { _eq: "$CURRENT_USER" } };

  // hoa_channels: read only channels you belong to.
  await upsertPermission(policyId, "hoa_channels", "read", {
    permissions: memberChannelFilter,
    validation: null,
    fields: ["*"],
  });

  // hoa_channel_messages: read + create only in channels you belong to;
  // edit/delete only your own messages.
  await upsertPermission(policyId, "hoa_channel_messages", "read", {
    permissions: memberViaChannelFilter,
    validation: null,
    fields: ["*"],
  });
  await upsertPermission(policyId, "hoa_channel_messages", "create", {
    permissions: {},
    validation: memberViaChannelFilter,
    fields: ["*"],
  });
  await upsertPermission(policyId, "hoa_channel_messages", "update", {
    permissions: ownMessageFilter,
    validation: null,
    fields: ["content", "is_edited"],
  });
  await upsertPermission(policyId, "hoa_channel_messages", "delete", {
    permissions: ownMessageFilter,
    validation: null,
    fields: ["*"],
  });

  // hoa_channel_members: read the member list of channels you belong to (for the
  // members panel); still only update your own row.
  await upsertPermission(policyId, "hoa_channel_members", "read", {
    permissions: memberViaChannelFilter,
    validation: null,
    fields: ["*"],
  });
  await upsertPermission(policyId, "hoa_channel_members", "update", {
    permissions: { user: { _eq: "$CURRENT_USER" } },
    validation: null,
    fields: ["last_read_at", "notifications_enabled"],
  });
}

async function main(): Promise<void> {
  console.log("🚀 Restricting channel access (Phase 8, Track A)...");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    await ensureChannelMembersAlias();
    await restrictMemberPermissions();
    console.log("\n✅ Done. Remember to run: pnpm generate:types");
  } catch (error: any) {
    console.error("\n❌ Failed:", error.message);
    process.exit(1);
  }
}

main();

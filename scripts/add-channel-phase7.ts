/**
 * Parity Round 3, Phase 7 — channels gap-close: schema + permissions.
 *
 * Adds (all idempotent):
 *   1. hoa_channel_messages.edited_at  (timestamp)  — set by POST /channels/:id/edit.
 *   2. hoa_channels.is_dm              (boolean)    — a direct message (private, two people).
 *   3. hoa_channel_members.present_at  (timestamp)  — the open-channel heartbeat
 *      (POST /channels/:id/presence); server-written, never client-writable.
 *   4. hoa_channel_moderation_log.action → an "Edit" choice (a manager's edit of
 *      someone else's message). Cosmetic: the column is a plain string.
 *   5. Removes the client `update` permission on hoa_channel_messages from the
 *      HOA Admin and HOA Member policies. Edits now go through the edit route,
 *      which enforces the 15-minute window (members) and the moderation log
 *      (managers); with the permission left in place a hand-made API call
 *      could skip both. Nothing in the app updates a message from the browser.
 *      (Hide/remove already run on the admin token; delete stays author-only.)
 *
 * Run with: pnpm add:channel-phase7
 * Requires: DIRECTUS_URL, DIRECTUS_STATIC_TOKEN (admin token). Then
 * `pnpm generate:types`.
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
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  if (response.status === 204) return null;
  return response.json();
}

async function ensureField(
  collection: string,
  field: string,
  body: Record<string, unknown>
): Promise<void> {
  try {
    await directusFetch(`/fields/${collection}/${field}`);
    console.log(`   ⏭️  ${collection}.${field} already exists`);
    return;
  } catch {
    /* not there yet */
  }
  await directusFetch(`/fields/${collection}`, {
    method: "POST",
    body: JSON.stringify({ field, ...body }),
  });
  console.log(`   ✅ Created ${collection}.${field}`);
}

async function ensureEditChoice(): Promise<void> {
  console.log("\n🛡️  hoa_channel_moderation_log.action → 'edit' choice");
  const field = (await directusFetch("/fields/hoa_channel_moderation_log/action")).data;
  const choices: any[] = field?.meta?.options?.choices || [];
  if (choices.some((c) => c.value === "edit")) {
    console.log("   ⏭️  already present");
    return;
  }
  await directusFetch("/fields/hoa_channel_moderation_log/action", {
    method: "PATCH",
    body: JSON.stringify({
      meta: {
        options: {
          ...(field.meta?.options || {}),
          choices: [...choices, { text: "Edit", value: "edit" }],
        },
      },
    }),
  });
  console.log("   ✅ Added 'edit'");
}

async function dropClientMessageUpdate(): Promise<void> {
  console.log("\n🔐 hoa_channel_messages: removing the client `update` permission");
  const policies = (
    await directusFetch(
      `/policies?filter=${encodeURIComponent(
        JSON.stringify({ name: { _in: ["HOA Admin", "HOA Member"] } })
      )}&fields=id,name&limit=-1`
    )
  ).data as Array<{ id: string; name: string }>;
  if (!policies?.length) {
    console.log("   ⚠️  Neither 'HOA Admin' nor 'HOA Member' policy found — nothing to do.");
    return;
  }
  for (const policy of policies) {
    const rows = (
      await directusFetch(
        `/permissions?filter=${encodeURIComponent(
          JSON.stringify({
            policy: { _eq: policy.id },
            collection: { _eq: "hoa_channel_messages" },
            action: { _eq: "update" },
          })
        )}&fields=id&limit=-1`
      )
    ).data as Array<{ id: number }>;
    if (!rows?.length) {
      console.log(`   ⏭️  ${policy.name}: no update permission (already narrowed)`);
      continue;
    }
    for (const r of rows) await directusFetch(`/permissions/${r.id}`, { method: "DELETE" });
    console.log(`   🗑️  ${policy.name}: removed ${rows.length} update permission(s)`);
  }
}

async function main(): Promise<void> {
  console.log("🚀 Channels Phase 7 — schema + permissions");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    console.log("\n✏️  Fields");
    await ensureField("hoa_channel_messages", "edited_at", {
      type: "timestamp",
      meta: { interface: "datetime", width: "half", note: "When the message was last edited." },
    });
    await ensureField("hoa_channels", "is_dm", {
      type: "boolean",
      schema: { default_value: false },
      meta: {
        interface: "boolean",
        special: ["cast-boolean"],
        width: "half",
        note: "A direct message: a private channel with exactly two members.",
      },
    });
    await ensureField("hoa_channel_members", "present_at", {
      type: "timestamp",
      meta: {
        interface: "datetime",
        width: "half",
        note: "Presence heartbeat (≤90 s old = has the channel open). Server-written.",
      },
    });
    await ensureEditChoice();
    await dropClientMessageUpdate();
    console.log("\n✅ Done. Remember to run: pnpm generate:types");
  } catch (error: any) {
    console.error("\n❌ Failed:", error.message);
    process.exit(1);
  }
}

main();

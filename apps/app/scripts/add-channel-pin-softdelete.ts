/**
 * Phase 8 follow-up — channel pinning + safe soft-delete.
 *
 * Adds:
 *   1. hoa_channels.is_pinned (boolean, default false) — org-wide pin. Pinned
 *      channels float to the top of the sidebar (sorted among themselves by
 *      latest activity).
 *   2. A 'deleted' choice on hoa_channels.status — a SOFT delete. "Delete
 *      channel" sets status='deleted', which hides the channel everywhere in the
 *      app but PRESERVES the row + its messages/comments/reactions (so an admin
 *      can't erase important history; recovery is possible via Directus).
 *
 * Existing channel permissions use fields ["*"], so is_pinned needs no new perms.
 *
 * Idempotent: the field is created/synced; the status choice is added if missing.
 *
 * Run with: pnpm tsx scripts/add-channel-pin-softdelete.ts
 * Requires: DIRECTUS_URL, DIRECTUS_STATIC_TOKEN (admin token). Then run
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
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function ensureIsPinned(): Promise<void> {
  console.log("\n📌 hoa_channels.is_pinned");
  let exists = false;
  try {
    await directusFetch("/fields/hoa_channels/is_pinned");
    exists = true;
  } catch {
    exists = false;
  }
  if (exists) {
    console.log("   ⏭️  is_pinned already exists, skipping");
    return;
  }
  await directusFetch("/fields/hoa_channels", {
    method: "POST",
    body: JSON.stringify({
      field: "is_pinned",
      type: "boolean",
      schema: { default_value: false },
      meta: {
        interface: "boolean",
        special: ["cast-boolean"],
        width: "half",
        note: "Pinned channels float to the top of the sidebar.",
      },
    }),
  });
  console.log("   ✅ Created is_pinned");
}

async function ensureDeletedStatusChoice(): Promise<void> {
  console.log("\n🗑️  hoa_channels.status → add 'deleted' choice (soft delete)");
  const field = (await directusFetch("/fields/hoa_channels/status")).data;
  const choices: any[] = field?.meta?.options?.choices || [];
  if (choices.some((c) => c.value === "deleted")) {
    console.log("   ⏭️  'deleted' choice already present, skipping");
    return;
  }
  const nextChoices = [
    ...choices,
    { text: "Deleted", value: "deleted", color: "var(--theme--danger)" },
  ];
  await directusFetch("/fields/hoa_channels/status", {
    method: "PATCH",
    body: JSON.stringify({
      meta: { options: { ...(field.meta?.options || {}), choices: nextChoices } },
    }),
  });
  console.log("   ✅ Added 'deleted' status choice");
}

async function main(): Promise<void> {
  console.log("🚀 Channel pin + soft-delete (Phase 8 follow-up)...");
  console.log(`📡 Connecting to: ${DIRECTUS_URL}`);
  try {
    await ensureIsPinned();
    await ensureDeletedStatusChoice();
    console.log("\n✅ Done. Remember to run: pnpm generate:types");
  } catch (error: any) {
    console.error("\n❌ Failed:", error.message);
    process.exit(1);
  }
}

main();

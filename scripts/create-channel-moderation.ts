/**
 * Channel moderation + entity-scoping (docs/plan-earnest-parity-upgrade.md, Phase 5).
 *
 *   hoa_channel_moderation_log — audit trail of hide/remove/report actions on
 *     channel messages. Snapshots the author + a stripped-HTML snippet so the
 *     record survives a hard message delete. Written ONLY via elevated server
 *     routes (no client permissions), mirroring Earnest's channel_moderation_log.
 *
 * Also adds entity-scoping FKs to hoa_channels (a channel can belong to a
 * project or a vendor, alongside the existing `request` FK), so a project/vendor
 * can carry its own discussion channel.
 *
 * Run with: pnpm run create:channel-moderation
 * Then:     pnpm generate:types
 * Idempotent: existing collection/fields/relations are skipped. NOT run on prod
 * automatically — run when the moderation UI ships.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
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
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function collectionExists(c: string): Promise<boolean> {
  try {
    await directusFetch(`/collections/${c}`);
    return true;
  } catch {
    return false;
  }
}

async function createCollection(collection: string, meta: Record<string, any>): Promise<void> {
  if (await collectionExists(collection)) {
    console.log(`   ⏭️  ${collection} exists`);
    return;
  }
  await directusFetch("/collections", {
    method: "POST",
    body: JSON.stringify({
      collection,
      meta,
      schema: { name: collection },
      fields: [
        {
          field: "id",
          type: "uuid",
          meta: { hidden: true, readonly: true, interface: "input", special: ["uuid"] },
          schema: { is_primary_key: true, has_auto_increment: false },
        },
      ],
    }),
  });
  console.log(`   ✅ collection ${collection}`);
}

async function createField(collection: string, field: string, cfg: Record<string, any>): Promise<void> {
  try {
    await directusFetch(`/fields/${collection}/${field}`);
    return;
  } catch {
    /* create */
  }
  await directusFetch(`/fields/${collection}`, { method: "POST", body: JSON.stringify({ field, ...cfg }) });
  console.log(`   ✅ field ${collection}.${field}`);
}

async function createRelation(cfg: Record<string, any>): Promise<void> {
  try {
    await directusFetch("/relations", { method: "POST", body: JSON.stringify(cfg) });
    console.log(`   ✅ relation ${cfg.collection}.${cfg.field} → ${cfg.related_collection}`);
  } catch (e: any) {
    if (/already|409/.test(e.message)) return;
    throw e;
  }
}

async function m2o(collection: string, field: string, related: string, onDelete: string, note?: string): Promise<void> {
  await createField(collection, field, {
    type: "uuid",
    meta: { interface: "select-dropdown-m2o", display: "related-values", note },
  });
  await createRelation({ collection, field, related_collection: related, schema: { on_delete: onDelete } });
}

async function main() {
  console.log("🚀 Channel moderation + entity-scoping...\n");

  // ── hoa_channel_moderation_log ─────────────────────────────────────────────
  console.log("🛡️  hoa_channel_moderation_log");
  await createCollection("hoa_channel_moderation_log", {
    icon: "gavel",
    note: "Audit trail of channel-message moderation (hide/remove/report). Server-write only.",
    display_template: "{{action}} — {{message_snippet}}",
    sort_field: "date_created",
  });
  await m2o("hoa_channel_moderation_log", "organization", "hoa_organizations", "CASCADE");
  await m2o("hoa_channel_moderation_log", "channel", "hoa_channels", "CASCADE");
  await m2o("hoa_channel_moderation_log", "moderator", "directus_users", "SET NULL", "Who took the action (or the reporter).");
  await createField("hoa_channel_moderation_log", "action", {
    type: "string",
    meta: {
      interface: "select-dropdown",
      options: { choices: [{ text: "Hide", value: "hide" }, { text: "Remove", value: "remove" }, { text: "Report", value: "report" }] },
      display: "labels",
    },
  });
  await createField("hoa_channel_moderation_log", "reason", { type: "text", meta: { interface: "input-multiline" } });
  await createField("hoa_channel_moderation_log", "message_id", {
    type: "string",
    meta: { interface: "input", note: "Plain message uuid — survives a hard delete of the message." },
  });
  await m2o("hoa_channel_moderation_log", "message_author", "directus_users", "SET NULL", "Snapshot of the message author.");
  await createField("hoa_channel_moderation_log", "message_snippet", {
    type: "text",
    meta: { interface: "input-multiline", note: "Stripped-HTML snapshot of the message content." },
  });
  await createField("hoa_channel_moderation_log", "date_created", {
    type: "timestamp",
    meta: { special: ["date-created"], interface: "datetime", readonly: true },
  });

  // ── Entity-scoping FKs on hoa_channels ─────────────────────────────────────
  console.log("\n🔗 hoa_channels entity-scoping (project / vendor)");
  await m2o("hoa_channels", "project", "hoa_projects", "SET NULL", "Optional: the project this channel discusses.");
  await m2o("hoa_channels", "vendor", "hoa_vendors", "SET NULL", "Optional: the vendor this channel discusses.");

  console.log("\n✅ Done. Next: pnpm generate:types");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});

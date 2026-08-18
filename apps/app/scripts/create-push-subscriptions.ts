/**
 * Create `push_subscriptions` — one row per BROWSER that has opted into web
 * push, tied to the Directus user who was signed in when it subscribed.
 *
 *   user          — M2O directus_users (required; CASCADE on delete, because a
 *                   subscription without its user is unaddressable garbage that
 *                   would otherwise keep receiving pushes)
 *   endpoint      — the push service URL issued by the browser. UNIQUE: it IS
 *                   the identity of a subscription, and duplicates would deliver
 *                   the same notification two or three times to one device.
 *   p256dh / auth — the subscription's encryption keys
 *   user_agent    — which browser/device this is, so a member can recognize it
 *   last_used_at  — stamped on each successful send; the signal for pruning
 *
 * NO role permissions are created, deliberately. Every read and write goes
 * through the server routes under /api/user/push/* using the admin token, and
 * those routes scope to the session user. The rows hold encryption keys that no
 * client ever needs to read, so granting any role access to this collection
 * would only add a way to leak or tamper with them.
 *
 * Run with: pnpm run create:push-subscriptions
 * Then:     pnpm generate:types
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN in .env (admin token).
 * Additive + idempotent: existing collection/fields/relations are skipped.
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

async function collectionExists(collection: string): Promise<boolean> {
  try {
    await directusFetch(`/collections/${collection}`);
    return true;
  } catch {
    return false;
  }
}

async function createCollection(collection: string, meta: Record<string, any>) {
  if (await collectionExists(collection)) {
    console.log(`   ⏭️  Collection ${collection} already exists, skipping...`);
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
  console.log(`   ✅ Created collection: ${collection}`);
}

async function createField(collection: string, field: string, fieldConfig: Record<string, any>) {
  try {
    await directusFetch(`/fields/${collection}/${field}`);
    console.log(`   ⏭️  Field ${collection}.${field} already exists, skipping...`);
    return;
  } catch {
    /* create below */
  }
  await directusFetch(`/fields/${collection}`, {
    method: "POST",
    body: JSON.stringify({ field, ...fieldConfig }),
  });
  console.log(`   ✅ Created field: ${collection}.${field}`);
}

async function createRelation(relationConfig: Record<string, any>) {
  try {
    await directusFetch("/relations", { method: "POST", body: JSON.stringify(relationConfig) });
    console.log(
      `   ✅ Created relation: ${relationConfig.collection}.${relationConfig.field} → ${relationConfig.related_collection}`
    );
  } catch (error: any) {
    if (
      error.message.includes("already exists") ||
      error.message.includes("already has an associated relationship") ||
      error.message.includes("409")
    ) {
      console.log(`   ⏭️  Relation ${relationConfig.collection}.${relationConfig.field} already exists, skipping...`);
    } else {
      throw error;
    }
  }
}

async function main() {
  console.log("🔔 Creating push_subscriptions...\n");

  await createCollection("push_subscriptions", {
    icon: "notifications_active",
    note: "One row per browser opted into web push. Written only by /api/user/push/* with the admin token.",
    display_template: "{{user_agent}}",
    hidden: false,
    sort_field: "date_created",
  });

  await createField("push_subscriptions", "user", {
    type: "uuid",
    meta: {
      interface: "select-dropdown-m2o",
      special: ["m2o"],
      required: true,
      width: "half",
      note: "The signed-in member this browser belongs to.",
    },
    schema: { is_nullable: false },
  });

  await createField("push_subscriptions", "endpoint", {
    type: "text",
    meta: {
      interface: "input",
      required: true,
      width: "full",
      note: "Push service URL issued by the browser. Unique — it identifies the subscription.",
    },
    schema: { is_nullable: false, is_unique: true },
  });

  await createField("push_subscriptions", "p256dh", {
    type: "text",
    meta: { interface: "input", width: "half", note: "Subscription public key (encryption)." },
    schema: { is_nullable: true },
  });

  await createField("push_subscriptions", "auth", {
    type: "text",
    meta: { interface: "input", width: "half", note: "Subscription auth secret (encryption)." },
    schema: { is_nullable: true },
  });

  await createField("push_subscriptions", "user_agent", {
    type: "string",
    meta: {
      interface: "input",
      width: "full",
      note: "Which browser/device this subscription is, so a member can recognize it.",
    },
    schema: { is_nullable: true, max_length: 255 },
  });

  await createField("push_subscriptions", "last_used_at", {
    type: "timestamp",
    meta: {
      interface: "datetime",
      width: "half",
      readonly: true,
      note: "Stamped on each successful send. Stale rows are pruning candidates.",
    },
    schema: { is_nullable: true },
  });

  await createField("push_subscriptions", "date_created", {
    type: "timestamp",
    meta: {
      interface: "datetime",
      special: ["date-created"],
      readonly: true,
      hidden: true,
      width: "half",
    },
    schema: { is_nullable: true },
  });

  // CASCADE: when a user is deleted their subscriptions must go with them —
  // an orphaned row is undeliverable and would linger forever.
  await createRelation({
    collection: "push_subscriptions",
    field: "user",
    related_collection: "directus_users",
    schema: { on_delete: "CASCADE" },
    meta: { sort_field: null },
  });

  console.log("\n✅ Done. Run `pnpm generate:types` to refresh Directus types.");
  console.log("   No role permissions were granted — /api/user/push/* uses the admin token.");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});

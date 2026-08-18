/**
 * Phase 9 (Stage C) — add scheduling/recurrence fields to hoa_emails.
 *
 * hoa_emails already has `status` (incl. 'scheduled') and `scheduled_at`. This
 * adds the recipient targeting + recurrence needed for the scheduler to send a
 * due email to the right people, and to roll a recurring email forward.
 *
 * Adds:
 * - recipient_filter: all | owners | tenants | custom
 * - recipient_ids: JSON array of hoa_members ids (when recipient_filter = custom)
 * - recurrence_rule: none | weekly | monthly
 * - last_run_at: timestamp of the last successful send
 * - next_run_at: timestamp of the next scheduled run (for recurring)
 *
 * Idempotent. Run with: pnpm run add:email-scheduling
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
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function createField(field: string, fieldConfig: Record<string, any>): Promise<void> {
  try {
    await directusFetch(`/fields/hoa_emails/${field}`);
    console.log(`   ⏭️  hoa_emails.${field} already exists, skipping...`);
    return;
  } catch {
    // create
  }
  await directusFetch(`/fields/hoa_emails`, {
    method: "POST",
    body: JSON.stringify({ field, ...fieldConfig }),
  });
  console.log(`   ✅ Created hoa_emails.${field}`);
}

async function main(): Promise<void> {
  console.log("🚀 Adding scheduling fields to hoa_emails\n");
  console.log(`📡 ${DIRECTUS_URL}`);

  // content_mode (Stage B) — was added to hoa_email_templates but missed on
  // hoa_emails itself; the composer/scheduler read & write it here.
  await createField("content_mode", {
    type: "string",
    schema: { default_value: "visual" },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      width: "half",
      options: {
        choices: [
          { text: "Visual", value: "visual" },
          { text: "MJML / HTML", value: "mjml" },
        ],
      },
      note: "How `content` should be interpreted by the renderer",
    },
  });

  await createField("recipient_filter", {
    type: "string",
    schema: { default_value: "all" },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      width: "half",
      options: {
        choices: [
          { text: "All members", value: "all" },
          { text: "Owners only", value: "owners" },
          { text: "Tenants only", value: "tenants" },
          { text: "Specific members", value: "custom" },
        ],
      },
      note: "Who a scheduled email is sent to",
    },
  });

  await createField("recipient_ids", {
    type: "json",
    meta: {
      interface: "input-code",
      width: "full",
      options: { language: "json" },
      note: "Array of hoa_members ids (used when recipient_filter = custom)",
    },
  });

  await createField("recurrence_rule", {
    type: "string",
    schema: { default_value: "none" },
    meta: {
      interface: "select-dropdown",
      display: "labels",
      width: "half",
      options: {
        choices: [
          { text: "Does not repeat", value: "none" },
          { text: "Weekly", value: "weekly" },
          { text: "Monthly", value: "monthly" },
        ],
      },
      note: "Repeat cadence for a scheduled email",
    },
  });

  await createField("last_run_at", {
    type: "timestamp",
    meta: { interface: "datetime", display: "datetime", width: "half", readonly: true, note: "Last successful send" },
  });

  await createField("next_run_at", {
    type: "timestamp",
    meta: { interface: "datetime", display: "datetime", width: "half", readonly: true, note: "Next scheduled run (recurring)" },
  });

  console.log("\n✅ Done.");
  console.log("📌 Next: run `pnpm generate:types`.");
}

main().catch((e) => {
  console.error("\n❌ Error:", e.message);
  process.exit(1);
});

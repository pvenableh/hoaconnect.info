/**
 * Phase 9 — add the "alert" choice to hoa_emails.email_type so the Directus
 * dropdown + generated types include it (the renderer/composer already support
 * it). Idempotent: PATCHing the field options just re-sets the full choice list.
 *
 * Run with: pnpm run add:email-type-alert
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const CHOICES = [
  { text: "Basic", value: "basic" },
  { text: "Alert", value: "alert", color: "var(--theme--danger)" },
  { text: "Newsletter", value: "newsletter" },
  { text: "Announcement", value: "announcement" },
  { text: "Reminder", value: "reminder" },
  { text: "Notice", value: "notice" },
];

async function main(): Promise<void> {
  const res = await fetch(`${DIRECTUS_URL}/fields/hoa_emails/email_type`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
    },
    body: JSON.stringify({ meta: { options: { choices: CHOICES } } }),
  });

  if (!res.ok) {
    console.error(`❌ HTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  console.log("✅ hoa_emails.email_type choices updated (added 'alert').");
  console.log("📌 Next: run `pnpm generate:types`.");
}

main();

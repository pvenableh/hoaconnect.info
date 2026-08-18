/**
 * Email block-builder collections (docs/plan-earnest-parity-upgrade.md, Phase 6),
 * ported from Earnest's newsletter block system into the hoa_ namespace:
 *
 *   hoa_newsletter_blocks — the reusable MJML block library (hero/content/cta/…),
 *                           each with a variables_schema describing its {{{slots}}}.
 *   hoa_email_partials    — header/footer/web-version-bar partials.
 *   hoa_template_blocks   — the join carrying per-instance variable values for a
 *                           template's ordered canvas.
 *
 * Design-time block variables use TRIPLE braces {{{key}}} (substituted at assemble
 * time); per-recipient runtime tokens stay as HOA's own {{merge_field}} and are
 * applied later in send.post.ts — the two layers compose cleanly.
 *
 * Also seeds a handful of system blocks (is_system, organization=null) so the
 * builder has something to drag on day one.
 *
 * Run with: pnpm run create:email-blocks
 * Then:     pnpm generate:types
 * Idempotent: existing collections/fields/relations/seed rows are skipped.
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

async function orgField(collection: string, required = false): Promise<void> {
  await createField(collection, "organization", {
    type: "uuid",
    schema: { is_nullable: !required },
    meta: {
      interface: "select-dropdown-m2o",
      width: "half",
      display: "related-values",
      display_options: { template: "{{name}}" },
      note: required ? undefined : "Null = a platform/system row shared by all orgs.",
    },
  });
  await createRelation({
    collection,
    field: "organization",
    related_collection: "hoa_organizations",
    meta: { sort_field: null },
    schema: { on_delete: "CASCADE" },
  });
}

async function audit(collection: string): Promise<void> {
  await createField(collection, "date_created", {
    type: "timestamp",
    meta: { special: ["date-created"], interface: "datetime", readonly: true, hidden: true },
  });
  await createField(collection, "date_updated", {
    type: "timestamp",
    meta: { special: ["date-updated"], interface: "datetime", readonly: true, hidden: true },
  });
}

const BLOCK_CATEGORIES = [
  "header", "hero", "content", "two-column", "cta", "image", "stats", "quote", "list", "divider", "social", "footer",
].map((c) => ({ text: c, value: c }));

async function main() {
  console.log("🚀 Email block-builder collections...\n");

  // ── hoa_newsletter_blocks ──────────────────────────────────────────────────
  console.log("🧱 hoa_newsletter_blocks");
  await createCollection("hoa_newsletter_blocks", {
    icon: "dashboard",
    note: "Reusable MJML blocks for the email builder.",
    display_template: "{{name}} ({{category}})",
    sort_field: "sort",
  });
  await createField("hoa_newsletter_blocks", "sort", { type: "integer", meta: { interface: "input", hidden: true } });
  await createField("hoa_newsletter_blocks", "name", { type: "string", schema: { is_nullable: false }, meta: { interface: "input", required: true } });
  await createField("hoa_newsletter_blocks", "slug", { type: "string", schema: { is_nullable: false, is_unique: true }, meta: { interface: "input", required: true } });
  await createField("hoa_newsletter_blocks", "description", { type: "text", meta: { interface: "input-multiline" } });
  await createField("hoa_newsletter_blocks", "category", { type: "string", meta: { interface: "select-dropdown", options: { choices: BLOCK_CATEGORIES }, display: "labels" } });
  await createField("hoa_newsletter_blocks", "mjml_source", { type: "text", meta: { interface: "input-code", options: { language: "xml" }, note: "MJML with {{{variable}}} slots." } });
  await createField("hoa_newsletter_blocks", "variables_schema", { type: "json", meta: { interface: "input-code", options: { language: "json" }, note: "[{ key, label, type, default }] describing the block's slots." } });
  await createField("hoa_newsletter_blocks", "thumbnail", { type: "uuid", meta: { interface: "file-image" } });
  await createRelation({ collection: "hoa_newsletter_blocks", field: "thumbnail", related_collection: "directus_files", schema: { on_delete: "SET NULL" } });
  await createField("hoa_newsletter_blocks", "is_system", { type: "boolean", schema: { default_value: false }, meta: { interface: "boolean", note: "Platform block available to every org." } });
  await orgField("hoa_newsletter_blocks");
  await audit("hoa_newsletter_blocks");

  // ── hoa_email_partials ─────────────────────────────────────────────────────
  console.log("\n🎀 hoa_email_partials");
  await createCollection("hoa_email_partials", {
    icon: "vertical_align_top",
    note: "Header / footer / web-version-bar partials for the email builder.",
    display_template: "{{name}} ({{type}})",
  });
  await createField("hoa_email_partials", "name", { type: "string", schema: { is_nullable: false }, meta: { interface: "input", required: true } });
  await createField("hoa_email_partials", "slug", { type: "string", meta: { interface: "input" } });
  await createField("hoa_email_partials", "type", { type: "string", meta: { interface: "select-dropdown", options: { choices: [{ text: "Header", value: "header" }, { text: "Footer", value: "footer" }, { text: "Web version bar", value: "web_version_bar" }] }, display: "labels" } });
  await createField("hoa_email_partials", "description", { type: "text", meta: { interface: "input-multiline" } });
  await createField("hoa_email_partials", "mjml_source", { type: "text", meta: { interface: "input-code", options: { language: "xml" } } });
  await createField("hoa_email_partials", "variables_schema", { type: "json", meta: { interface: "input-code", options: { language: "json" } } });
  await createField("hoa_email_partials", "instance_variables", { type: "json", meta: { interface: "input-code", options: { language: "json" } } });
  await createField("hoa_email_partials", "is_default", { type: "boolean", schema: { default_value: false }, meta: { interface: "boolean" } });
  await orgField("hoa_email_partials");
  await audit("hoa_email_partials");

  // ── hoa_template_blocks (join) ─────────────────────────────────────────────
  console.log("\n🔗 hoa_template_blocks");
  await createCollection("hoa_template_blocks", {
    icon: "link",
    note: "A template's ordered canvas of blocks, each with per-instance variable values.",
    sort_field: "sort",
    hidden: true,
  });
  await createField("hoa_template_blocks", "sort", { type: "integer", meta: { interface: "input", hidden: true } });
  await createField("hoa_template_blocks", "template_id", { type: "uuid", schema: { is_nullable: false }, meta: { interface: "select-dropdown-m2o", required: true } });
  await createRelation({ collection: "hoa_template_blocks", field: "template_id", related_collection: "hoa_email_templates", meta: { sort_field: "sort", one_field: "blocks" }, schema: { on_delete: "CASCADE" } });
  await createField("hoa_template_blocks", "block_id", { type: "uuid", schema: { is_nullable: false }, meta: { interface: "select-dropdown-m2o", required: true } });
  await createRelation({ collection: "hoa_template_blocks", field: "block_id", related_collection: "hoa_newsletter_blocks", schema: { on_delete: "CASCADE" } });
  await createField("hoa_template_blocks", "instance_variables", { type: "json", meta: { interface: "input-code", options: { language: "json" } } });
  await createField("hoa_template_blocks", "date_created", { type: "timestamp", meta: { special: ["date-created"], interface: "datetime", readonly: true } });

  // ── Seed a few system blocks ───────────────────────────────────────────────
  console.log("\n🌱 Seeding system blocks");
  await seedBlocks();

  console.log("\n✅ Done. Next: pnpm generate:types");
}

async function blockExists(slug: string): Promise<boolean> {
  const rows = await directusFetch(`/items/hoa_newsletter_blocks?filter[slug][_eq]=${slug}&limit=1`);
  return !!rows?.data?.length;
}

async function seedBlocks(): Promise<void> {
  const blocks = [
    {
      slug: "sys-hero", name: "Hero", category: "hero",
      description: "A bold headline over a background color with a subheading.",
      mjml_source: `<mj-section background-color="{{{bg_color}}}" padding="40px 24px"><mj-column><mj-text align="center" font-size="28px" font-weight="700" color="{{{text_color}}}">{{{headline}}}</mj-text><mj-text align="center" font-size="16px" color="{{{text_color}}}">{{{subheading}}}</mj-text></mj-column></mj-section>`,
      variables_schema: [
        { key: "headline", label: "Headline", type: "text", default: "Welcome" },
        { key: "subheading", label: "Subheading", type: "text", default: "" },
        { key: "bg_color", label: "Background", type: "color", default: "#1f2937" },
        { key: "text_color", label: "Text color", type: "color", default: "#ffffff" },
      ],
    },
    {
      slug: "sys-content", name: "Content", category: "content",
      description: "A heading and a paragraph of body copy.",
      mjml_source: `<mj-section padding="16px 24px"><mj-column><mj-text font-size="20px" font-weight="700" color="#111827">{{{heading}}}</mj-text><mj-text font-size="15px" line-height="1.6" color="#374151">{{{body}}}</mj-text></mj-column></mj-section>`,
      variables_schema: [
        { key: "heading", label: "Heading", type: "text", default: "Section heading" },
        { key: "body", label: "Body", type: "html", default: "Write your message here." },
      ],
    },
    {
      slug: "sys-cta", name: "Call to action", category: "cta",
      description: "A centered button linking somewhere.",
      mjml_source: `<mj-section padding="8px 24px 24px"><mj-column><mj-button background-color="{{{button_color}}}" color="#ffffff" href="{{{url}}}" border-radius="8px" font-weight="600">{{{label}}}</mj-button></mj-column></mj-section>`,
      variables_schema: [
        { key: "label", label: "Button label", type: "text", default: "Learn more" },
        { key: "url", label: "Link URL", type: "url", default: "https://" },
        { key: "button_color", label: "Button color", type: "color", default: "#2563eb" },
      ],
    },
    {
      slug: "sys-image", name: "Image", category: "image",
      description: "A full-width image.",
      mjml_source: `<mj-section padding="8px 24px"><mj-column><mj-image src="{{{src}}}" alt="{{{alt}}}" border-radius="8px" /></mj-column></mj-section>`,
      variables_schema: [
        { key: "src", label: "Image URL", type: "image", default: "" },
        { key: "alt", label: "Alt text", type: "text", default: "" },
      ],
    },
    {
      slug: "sys-divider", name: "Divider", category: "divider",
      description: "A horizontal rule.",
      mjml_source: `<mj-section padding="4px 24px"><mj-column><mj-divider border-color="#e5e7eb" border-width="1px" /></mj-column></mj-section>`,
      variables_schema: [],
    },
    {
      slug: "sys-footer", name: "Footer", category: "footer",
      description: "A small closing line.",
      mjml_source: `<mj-section padding="16px 24px 32px"><mj-column><mj-text align="center" font-size="12px" color="#9ca3af">{{{text}}}</mj-text></mj-column></mj-section>`,
      variables_schema: [{ key: "text", label: "Footer text", type: "text", default: "Sent by your community association." }],
    },
  ];

  let sort = 1;
  for (const b of blocks) {
    if (await blockExists(b.slug)) {
      console.log(`   ⏭️  block ${b.slug}`);
      sort++;
      continue;
    }
    await directusFetch("/items/hoa_newsletter_blocks", {
      method: "POST",
      body: JSON.stringify({
        ...b,
        variables_schema: b.variables_schema, // stored as JSON
        is_system: true,
        organization: null,
        sort: sort++,
      }),
    });
    console.log(`   ✅ block ${b.slug}`);
  }
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});

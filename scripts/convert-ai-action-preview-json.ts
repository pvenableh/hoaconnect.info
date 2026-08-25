/**
 * Convert ai_actions.preview from `text` to `json`.
 *
 * `preview` holds a JSON object describing what a proposed action will do. It
 * has always been a `text` column, which is why Directus returns it as a STRING
 * and why every proposal card in the app rendered character-by-character until
 * Session 6 parsed it at the API boundary. `payload` and `result` on the same
 * collection are already `json`; this makes the third one match.
 *
 * ⚠️ This is TIDINESS, NOT A FIX. The parse at the API boundary is correct and
 * defensive either way, and it stays after this runs — a `json` column can still
 * hand back a string if something wrote one, and the boundary is the right place
 * to be sure. Nothing breaks if this script is never run.
 *
 * ⚠️ Unlike every other schema script in here, this one ALTERS AN EXISTING
 * COLUMN rather than adding a new one. Postgres casts `text` to `json` row by
 * row, and one row of invalid JSON aborts the whole statement. So this refuses
 * to run until it has read every row and proved the cast will survive — see
 * `preflight` below. An EMPTY STRING is the case worth naming: it reads as
 * harmless, it is not valid JSON, and it will fail the cast. NULL is fine.
 *
 * Idempotent — a second run finds the field already `json` and stops.
 *
 * Run with: pnpm convert:preview-json   (add --dry-run to preflight only)
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");

async function directusFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Read every row and classify its `preview`. Returns the rows that would abort
 * the cast, so the caller can refuse rather than discover it halfway through a
 * DDL statement on a live table.
 */
async function preflight(): Promise<{ total: number; ok: number; nulls: number; bad: Array<{ id: string; sample: string }> }> {
  const rows: Array<{ id: string; preview: unknown }> =
    (await directusFetch(`/items/ai_actions?limit=-1&fields=id,preview`))?.data ?? [];

  let ok = 0;
  let nulls = 0;
  const bad: Array<{ id: string; sample: string }> = [];

  for (const row of rows) {
    const v = row.preview;
    if (v === null || v === undefined) {
      nulls += 1;
      continue;
    }
    // An empty (or whitespace-only) string is NOT valid JSON and will fail the
    // cast. Called out separately because it is the one that looks harmless.
    const s = String(v);
    if (s.trim() === "") {
      bad.push({ id: String(row.id), sample: `<empty string, length ${s.length}>` });
      continue;
    }
    try {
      JSON.parse(s);
      ok += 1;
    } catch {
      bad.push({ id: String(row.id), sample: s.slice(0, 100) });
    }
  }

  return { total: rows.length, ok, nulls, bad };
}

async function main(): Promise<void> {
  console.log("🚀 ai_actions.preview: text → json\n");

  const field = await directusFetch(`/fields/ai_actions/preview`).catch(() => null);
  if (!field?.data) {
    console.error("❌ ai_actions.preview does not exist. Run `pnpm create:ai-actions` first.");
    process.exit(1);
  }
  if (field.data.type === "json") {
    console.log("   ⏭️  Already `json`, nothing to do.");
    return;
  }
  console.log(`   Current: type=${field.data.type} db=${field.data.schema?.data_type}\n`);

  const { total, ok, nulls, bad } = await preflight();
  console.log(`   Preflight: ${total} rows — ${ok} valid JSON, ${nulls} NULL, ${bad.length} would FAIL the cast`);

  if (bad.length) {
    console.error("\n❌ Refusing to convert. These rows would abort the cast:");
    for (const b of bad.slice(0, 10)) console.error(`     ${b.id}  ${b.sample}`);
    if (bad.length > 10) console.error(`     … and ${bad.length - 10} more`);
    console.error("\n   Fix or null them first, then re-run. Nothing has been changed.");
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("\n   --dry-run: the cast would succeed. Nothing changed.");
    return;
  }

  await directusFetch(`/fields/ai_actions/preview`, {
    method: "PATCH",
    body: JSON.stringify({
      type: "json",
      meta: { interface: "input-code", options: { language: "json" } },
      schema: { data_type: "json", is_nullable: true },
    }),
  });

  const after = await directusFetch(`/fields/ai_actions/preview`);
  console.log(`\n✅ Converted. Now: type=${after.data.type} db=${after.data.schema?.data_type}`);
  console.log("   Run `pnpm generate:types` and commit core/types/directus.ts.");
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});

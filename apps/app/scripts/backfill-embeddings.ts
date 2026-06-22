/**
 * Backfill doc/bylaw RAG embeddings for EXISTING governing documents.
 *
 * For every org (or one via --org=<slug>), embeds its published hoa_governance
 * rows (bylaws/rules) and hoa_documents (PDFs) into ai_doc_chunks via the shared
 * ingest util — the same code the on-write hook runs. Idempotent: a source whose
 * text is unchanged (same content_hash) is skipped, so re-running is cheap and
 * safe. Each newly embedded source meters an `embed` debit into the org wallet.
 *
 * Safety: DRY-RUN by default (reports counts, embeds nothing → no cost). Pass
 * --apply to actually embed. Optional --org=<slug> to target a single org.
 *
 * Run:  pnpm run backfill:embeddings                         (dry run, all orgs)
 *       pnpm run backfill:embeddings -- --apply              (apply, all orgs)
 *       pnpm run backfill:embeddings -- --apply --org=605lincolnroad
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN + VOYAGE_API_KEY in .env.
 */

import { ingestItem, type RagSourceCollection } from "../../../core/server/utils/rag-ingest";

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;

if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes("--apply");
const ORG_FILTER = ARGS.find((a) => a.startsWith("--org="))?.split("=")[1] || null;

async function df(endpoint: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`, ...options.headers },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const q = (obj: unknown) => encodeURIComponent(JSON.stringify(obj));

async function publishedIds(collection: RagSourceCollection, orgId: string): Promise<string[]> {
  const filter = { organization: { _eq: orgId }, status: { _eq: "published" } };
  const rows = (await df(`/items/${collection}?filter=${q(filter)}&fields=id&limit=-1`))?.data as { id: string }[];
  return (rows ?? []).map((r) => r.id);
}

async function main() {
  if (!VOYAGE_API_KEY) {
    console.error("❌ VOYAGE_API_KEY is not set — nothing to embed. Set it in .env first.");
    process.exit(1);
  }
  console.log(`🚀 RAG embedding backfill ${APPLY ? "(APPLY)" : "(dry run — no cost)"}\n📡 ${DIRECTUS_URL}\n`);

  const orgFilter = ORG_FILTER ? `&filter=${q({ slug: { _eq: ORG_FILTER } })}` : "";
  const orgs = (await df(`/items/hoa_organizations?fields=id,name,slug&limit=-1${orgFilter}`))?.data as {
    id: string;
    name?: string;
    slug?: string;
  }[];
  if (!orgs?.length) {
    console.log("No organizations matched.");
    return;
  }

  const totals = { indexed: 0, unchanged: 0, removed: 0, skipped: 0, tokens: 0 };

  for (const org of orgs) {
    const gov = await publishedIds("hoa_governance", org.id);
    const docs = await publishedIds("hoa_documents", org.id);
    console.log(`🏠 ${org.name ?? org.slug ?? org.id} — ${gov.length} governance, ${docs.length} documents`);

    if (!APPLY) continue;

    for (const [collection, ids] of [
      ["hoa_governance", gov],
      ["hoa_documents", docs],
    ] as [RagSourceCollection, string[]][]) {
      for (const id of ids) {
        const r = await ingestItem(collection, id);
        totals[r.status] = (totals[r.status] ?? 0) + 1;
        totals.tokens += r.tokens ?? 0;
        const detail = r.status === "indexed" ? ` (${r.chunks} chunks, ${r.tokens} tok)` : "";
        console.log(`   ${r.status === "indexed" ? "✅" : "•"} ${collection}/${id}: ${r.status}${detail}`);
      }
    }
  }

  if (APPLY) {
    console.log(
      `\n✅ Done. indexed=${totals.indexed} unchanged=${totals.unchanged} removed=${totals.removed} skipped=${totals.skipped} · ${totals.tokens} Voyage tokens billed.`
    );
  } else {
    console.log("\nℹ️  Dry run — re-run with --apply to embed (incurs Voyage cost, metered to each org wallet).");
  }
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});

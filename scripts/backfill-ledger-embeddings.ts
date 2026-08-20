/**
 * Backfill the Community Ledger vector index for entries that already exist.
 *
 * `writeAuditEntry` indexes each new entry as it is written, but that hook is
 * best-effort by design (bounded, failure-proof — an embedding vendor must never
 * be able to put a hole in a community's permanent record). This script is the
 * safety net: it walks `org_audit_log` and indexes anything the hook missed,
 * plus every entry written before the hook existed.
 *
 * Idempotent on `content_hash`, so re-running costs nothing for entries whose
 * text is unchanged — which, `org_audit_log` being append-only, is all of them.
 *
 * Safety: DRY-RUN by default (counts what it would embed, spends nothing).
 * Pass --apply to embed. Optional --org=<slug> to target one community.
 *
 * Run:  pnpm run backfill:ledger-embeddings
 *       pnpm run backfill:ledger-embeddings -- --apply
 *       pnpm run backfill:ledger-embeddings -- --apply --org=transition-test
 *
 * Prerequisites: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN + VOYAGE_API_KEY in .env,
 * and `pnpm run create:ai-ledger-chunks` already run against the target.
 */

import { indexLedgerEntry, type IndexableEntry } from "../core/server/utils/ledger-index";

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

const q = (obj: unknown) => encodeURIComponent(JSON.stringify(obj));

async function df(endpoint: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function main() {
  if (!VOYAGE_API_KEY) {
    console.error("❌ VOYAGE_API_KEY is not set — nothing can be embedded. Set it in .env first.");
    process.exit(1);
  }

  console.log(`🚀 Community Ledger embedding backfill ${APPLY ? "(APPLY)" : "(dry run — no cost)"}`);
  console.log(`📡 ${DIRECTUS_URL}\n`);

  let orgId: string | null = null;
  if (ORG_FILTER) {
    const org = (await df(`/items/hoa_organizations?filter=${q({ slug: { _eq: ORG_FILTER } })}&fields=id,name&limit=1`))
      ?.data?.[0];
    if (!org) {
      console.error(`❌ No community with slug "${ORG_FILTER}".`);
      process.exit(1);
    }
    orgId = org.id;
    console.log(`🏘  ${org.name} (${ORG_FILTER})\n`);
  }

  const filter = orgId ? { organization: { _eq: orgId } } : {};
  const fields = "id,organization,event_type,occurred_at,actor_name,visibility,summary,payload";
  const entries =
    ((
      await df(
        `/items/org_audit_log?filter=${q(filter)}&fields=${fields}&sort=-occurred_at&limit=-1`
      )
    )?.data as any[]) ?? [];

  // Which are already indexed. One read rather than one per entry.
  const indexed = new Set<string>(
    (((await df(`/items/ai_ledger_chunks?filter=${q(filter)}&fields=entry&limit=-1`))?.data as any[]) ?? []).map(
      (r) => String(r.entry)
    )
  );

  const missing = entries.filter((e) => !indexed.has(String(e.id)));

  console.log(`📒 ${entries.length} ledger entries, ${indexed.size} already indexed, ${missing.length} to embed.`);
  const byTier = missing.reduce<Record<string, number>>((acc, e) => {
    const k = String(e.visibility ?? "board");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  if (missing.length) console.log(`   by visibility: ${JSON.stringify(byTier)}`);

  if (!APPLY) {
    console.log("\n💡 Dry run — nothing embedded. Re-run with --apply to index them.");
    return;
  }
  if (!missing.length) {
    console.log("\n✅ Nothing to do.");
    return;
  }

  const counts: Record<string, number> = { indexed: 0, unchanged: 0, skipped: 0, failed: 0 };
  for (const e of missing) {
    try {
      const result = await indexLedgerEntry(e as IndexableEntry);
      counts[result] = (counts[result] ?? 0) + 1;
      console.log(`   ${result === "indexed" ? "✅" : "⏭️ "} ${result.padEnd(9)} ${String(e.summary ?? "").slice(0, 70)}`);
    } catch (err: any) {
      counts.failed = (counts.failed ?? 0) + 1;
      console.warn(`   ❌ failed    ${String(e.id)}: ${err?.message || err}`);
    }
  }

  console.log(`\n✅ Done: ${JSON.stringify(counts)}`);
}

main().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});

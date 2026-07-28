// The AI context broker — a three-tier cache in front of gatherOrgContext() so
// the assistant's org grounding is cheap and low-latency:
//
//   L1  in-memory Map        (5-min TTL)   — per-warm-instance, zero I/O
//   L2  ai_context_snapshots (30-min TTL)  — shared across instances (Directus)
//   L3  gatherOrgContext()   (live)        — the source of truth, rebuilt on miss
//
// Stale-while-revalidate: a stale L2 snapshot is served immediately and rebuilt
// in the background, so a user never waits on a cold rebuild once one org row
// exists. If the ai_context_snapshots collection is ABSENT (pre-migration), the
// L2 reads/writes fail quietly and the broker degrades to L1 + live rebuild —
// strictly no worse than calling gatherOrgContext() directly. See
// docs/plan-earnest-parity-upgrade.md (Phase 0 — context broker).

import { createItem, readItems, updateItem } from "@directus/sdk";

const L1_TTL_MS = 5 * 60 * 1000;
const L2_TTL_MS = 30 * 60 * 1000;
const SNAPSHOT_COLLECTION = "ai_context_snapshots" as const;

interface L1Entry {
  content: string;
  /** Wall-clock ms after which this L1 copy is considered stale. */
  expiresAt: number;
}

const _l1 = new Map<string, L1Entry>();
/** In-flight rebuilds, so concurrent turns for one org share a single rebuild. */
const _inflight = new Map<string, Promise<string>>();

/** Rough token estimate (~4 chars/token) stored alongside the snapshot. */
function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

interface Snapshot {
  id: string;
  content: string;
  expiresAt: number;
}

/** Read the org's L2 snapshot. Returns null on any failure (incl. missing collection). */
async function readSnapshot(orgId: string): Promise<Snapshot | null> {
  try {
    const directus = getTypedDirectus();
    const rows = await directus.request(
      readItems(SNAPSHOT_COLLECTION, {
        filter: { organization: { _eq: orgId }, context_type: { _eq: "org" } },
        fields: ["id", "content", "expires_at"],
        limit: 1,
      })
    );
    const row = rows?.[0];
    if (!row) return null;
    return {
      id: String(row.id),
      content: String(row.content ?? ""),
      expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : 0,
    };
  } catch {
    return null; // collection absent or query failed → caller degrades to live
  }
}

/** Upsert the org's L2 snapshot. Best-effort — a cache write must never break a chat turn. */
async function writeSnapshot(orgId: string, content: string, expiresAt: number): Promise<void> {
  try {
    const directus = getTypedDirectus();
    const existing = await readSnapshot(orgId);
    const payload = {
      organization: orgId,
      context_type: "org",
      content,
      token_estimate: estimateTokens(content),
      expires_at: new Date(expiresAt).toISOString(),
    };
    if (existing) {
      await directus.request(updateItem(SNAPSHOT_COLLECTION, existing.id, payload));
    } else {
      await directus.request(createItem(SNAPSHOT_COLLECTION, payload));
    }
  } catch {
    /* best-effort — ignore */
  }
}

/** Rebuild org context live, warm L1, and persist L2. Deduped per org via _inflight. */
async function rebuild(orgId: string): Promise<string> {
  const inflight = _inflight.get(orgId);
  if (inflight) return inflight;

  const p = (async () => {
    const content = await gatherOrgContext(orgId);
    const now = Date.now();
    _l1.set(orgId, { content, expiresAt: now + L1_TTL_MS });
    await writeSnapshot(orgId, content, now + L2_TTL_MS);
    return content;
  })();

  _inflight.set(orgId, p);
  try {
    return await p;
  } finally {
    _inflight.delete(orgId);
  }
}

/**
 * The org-context block for the chat system prompt, served from the cheapest
 * warm tier available. Drop-in replacement for `gatherOrgContext(orgId)`.
 */
export async function getOrgContextCached(orgId: string): Promise<string> {
  const now = Date.now();

  const l1 = _l1.get(orgId);
  if (l1 && l1.expiresAt > now) return l1.content;

  const l2 = await readSnapshot(orgId);
  if (l2 && l2.content) {
    // Warm L1 from L2 regardless of freshness (bounds re-reads to once / 5 min).
    _l1.set(orgId, { content: l2.content, expiresAt: now + L1_TTL_MS });
    if (l2.expiresAt <= now) {
      // Stale → serve now, refresh in the background (SWR).
      void rebuild(orgId).catch(() => {});
    }
    return l2.content;
  }

  // Cold (no L2 row / collection absent) → build synchronously.
  return rebuild(orgId);
}

/** Drop the org's warm L1 copy — call after a write that changes org context. */
export function invalidateOrgContext(orgId: string): void {
  _l1.delete(orgId);
}

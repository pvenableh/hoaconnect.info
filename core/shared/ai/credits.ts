// Pure AI-credit economics: token→cost→credits conversion with margin, the
// purchasable credit packs, and wallet/ledger math (spend order, balance gating,
// deriving a balance from the append-only ledger).
//
// Framework-free and Directus-free so the metering server route
// (server/api/ai/draft) and the wallet UI share ONE source of truth, and the
// money-sensitive bits (margin, rounding, allowance-vs-purchased spend order,
// refuse-at-zero gating) are unit-testable without a live Anthropic API, Stripe,
// or Directus. See docs/plan-anthropic-ai-assistant-tokens.md §3 (the token
// economy) and §6 (economics). Mirrors the cost basis published by the
// claude-api skill's model table.
//
// Glossary:
//   - "credits"  — what the user sees. Anchor: CREDITS_PER_DOLLAR credits = $1.
//   - "allowance" — plan-funded credits that RESET each billing period.
//   - "purchased" — Stripe top-up credits that NEVER expire.
//   Spend order: allowance first, then purchased (so the resetting pool drains
//   before the permanent one).

// ── Anchors & margin ─────────────────────────────────────────────────────────

/** 1,000 credits = $1 to the user (the published $-per-credit anchor). */
export const CREDITS_PER_DOLLAR = 1000;

/**
 * Multiplier applied to real Anthropic cost before converting to credits —
 * covers token cost + overhead + margin. Prompt caching and cheap-model routing
 * quietly improve realized margin beyond this. Start at 4×.
 */
export const DEFAULT_MARGIN_MULTIPLIER = 4;

/**
 * Margin for comped / free ("Hue") accounts: pure pass-through cost, no markup.
 * At 1× the credit↔dollar math lines up exactly — 1,000 credits represent $1 of
 * real Anthropic spend, and the $1-per-1,000-credit packs sell them at cost.
 */
export const AT_COST_MARGIN_MULTIPLIER = 1;

/** The credit margin an org pays: free/comped accounts at cost, everyone else retail. */
export function marginForAccount(isFreeAccount: boolean | null | undefined): number {
  return isFreeAccount ? AT_COST_MARGIN_MULTIPLIER : DEFAULT_MARGIN_MULTIPLIER;
}

// ── Model pricing ────────────────────────────────────────────────────────────

/** USD per 1,000,000 tokens, per channel. */
export interface ModelPrice {
  /** Uncached input tokens. */
  input: number;
  /** Output tokens. */
  output: number;
  /** Cache-read input tokens (~0.1× input). */
  cacheRead: number;
  /** Cache-write input tokens (1.25× input, 5-minute TTL). */
  cacheWrite: number;
}

/**
 * Published list prices (USD / MTok) from the claude-api skill's model table.
 * Cache read = 0.1× input, cache write (5-min) = 1.25× input. Keep these in
 * sync with the live pricing page; the margin multiplier absorbs minor drift.
 */
export const MODEL_PRICING: Record<string, ModelPrice> = {
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
};

// ── Embedding pricing (Voyage AI) ────────────────────────────────────────────

/** USD per 1,000,000 tokens for an embedding model. Embeddings bill input only. */
export interface EmbeddingPrice {
  input: number;
}

/**
 * Voyage AI embedding list prices (USD / MTok). A separate vendor from Anthropic,
 * but cost flows through the SAME credit math (× margin × CREDITS_PER_DOLLAR) so
 * RAG ingestion meters into the org's AI wallet as an `embed` debit. Keep
 * VOYAGE_MODEL in server/utils/voyage.ts in sync with this table.
 */
export const VOYAGE_PRICING: Record<string, EmbeddingPrice> = {
  "voyage-3.5-lite": { input: 0.02 },
  "voyage-3.5": { input: 0.06 },
};

/** Resolve an embedding price row, falling back to voyage-3.5-lite for unknown ids. */
export function embeddingPriceFor(model: string): EmbeddingPrice {
  return VOYAGE_PRICING[model] ?? VOYAGE_PRICING["voyage-3.5-lite"]!;
}

/**
 * Credits to charge for embedding `tokens` input tokens:
 *   ceil( (tokens / 1e6 × $/MTok) × margin × creditsPerDollar )
 * Always ≥ 1 credit for any non-zero token count (mirrors creditsForUsage), so a
 * trivial query embedding still registers a debit.
 */
export function creditsForEmbedding(
  tokens: number,
  model: string,
  opts: CreditOptions = {}
): number {
  const margin = opts.marginMultiplier ?? DEFAULT_MARGIN_MULTIPLIER;
  const cpd = opts.creditsPerDollar ?? CREDITS_PER_DOLLAR;
  const t = nonNeg(tokens);
  const raw = (t / 1_000_000) * embeddingPriceFor(model).input * margin * cpd;
  if (raw <= 0) return 0;
  return Math.max(1, Math.ceil(raw));
}

/** Model tiers exposed as a simple Fast/Best toggle (default Standard). */
export const MODEL_TIERS = {
  fast: "claude-haiku-4-5",
  standard: "claude-sonnet-4-6",
  max: "claude-opus-4-8",
} as const;

export type ModelTier = keyof typeof MODEL_TIERS;

/** The cheap tier used for composer drafts (Session 3 wedge). */
export const DRAFT_MODEL = MODEL_TIERS.fast;

/** Resolve a price row, falling back to Sonnet (standard) for unknown ids. */
export function priceFor(model: string): ModelPrice {
  return MODEL_PRICING[model] ?? MODEL_PRICING[MODEL_TIERS.standard]!;
}

// ── Token usage → cost → credits ─────────────────────────────────────────────

/** The token channels we meter — mirrors Anthropic's `usage` block. */
export interface TokenUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

const nonNeg = (n: number | null | undefined): number =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;

/**
 * Real blended Anthropic cost (USD) for one completion's token usage. Bills
 * cache reads at their lower rate and cache writes at the write premium, so the
 * caching savings flow through to margin.
 */
export function blendedCostUsd(usage: TokenUsage, model: string): number {
  const p = priceFor(model);
  const per = 1_000_000;
  return (
    (nonNeg(usage.input_tokens) * p.input +
      nonNeg(usage.output_tokens) * p.output +
      nonNeg(usage.cache_read_input_tokens) * p.cacheRead +
      nonNeg(usage.cache_creation_input_tokens) * p.cacheWrite) /
    per
  );
}

export interface CreditOptions {
  marginMultiplier?: number;
  creditsPerDollar?: number;
}

/**
 * Credits to charge for a completion:
 *   ceil( blendedCost($) × margin × creditsPerDollar )
 * Always ≥ 1 credit for any non-zero usage so trivial calls still register.
 */
export function creditsForUsage(
  usage: TokenUsage,
  model: string,
  opts: CreditOptions = {}
): number {
  const margin = opts.marginMultiplier ?? DEFAULT_MARGIN_MULTIPLIER;
  const cpd = opts.creditsPerDollar ?? CREDITS_PER_DOLLAR;
  const raw = blendedCostUsd(usage, model) * margin * cpd;
  if (raw <= 0) return 0;
  return Math.max(1, Math.ceil(raw));
}

/**
 * Pre-flight estimate (shown BEFORE a heavy action) from projected token counts.
 * Treats projected input as uncached (conservative — a cache hit only makes the
 * real charge cheaper). Use for the "this draft will use ~N credits" hint.
 */
export function estimateCredits(
  projected: { inputTokens: number; outputTokens: number },
  model: string,
  opts: CreditOptions = {}
): number {
  return creditsForUsage(
    { input_tokens: projected.inputTokens, output_tokens: projected.outputTokens },
    model,
    opts
  );
}

// ── Credit packs (Stripe top-ups) ────────────────────────────────────────────

export interface CreditPack {
  id: "small" | "medium" | "large";
  label: string;
  /** Price in whole USD (also the Stripe amount basis). */
  priceUsd: number;
  /** Credits granted on purchase (includes any volume bonus). */
  credits: number;
}

/**
 * One-time top-up packs (plan §3.2). Bigger packs carry a volume bonus to nudge
 * larger purchases — the overage profit center.
 */
export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: "small", label: "Small", priceUsd: 10, credits: 10_000 },
  { id: "medium", label: "Medium", priceUsd: 25, credits: 27_500 },
  { id: "large", label: "Large", priceUsd: 100, credits: 120_000 },
] as const;

export function packById(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}

// ── Wallet & spend order ─────────────────────────────────────────────────────

export interface Wallet {
  /** Plan-funded credits remaining this period (drained first). */
  allowance: number;
  /** Purchased credits remaining (never expire; drained second). */
  purchased: number;
}

export function walletBalance(w: Wallet): number {
  return Math.max(0, w.allowance) + Math.max(0, w.purchased);
}

export function canAfford(w: Wallet, credits: number): boolean {
  return credits <= 0 || walletBalance(w) >= credits;
}

export interface DebitSplit {
  ok: boolean;
  fromAllowance: number;
  fromPurchased: number;
}

/**
 * Compute how a debit splits across pools — allowance first, then purchased.
 * `ok: false` (and a zero split) when the wallet can't cover it; callers must
 * refuse the action rather than overdraw (plan §3.3 "refuse at zero balance").
 */
export function splitDebit(w: Wallet, credits: number): DebitSplit {
  if (credits <= 0) return { ok: true, fromAllowance: 0, fromPurchased: 0 };
  if (!canAfford(w, credits)) return { ok: false, fromAllowance: 0, fromPurchased: 0 };
  const fromAllowance = Math.min(Math.max(0, w.allowance), credits);
  const fromPurchased = credits - fromAllowance;
  return { ok: true, fromAllowance, fromPurchased };
}

/** Apply a debit, returning the new wallet. Throws if it would overdraw. */
export function applyDebit(w: Wallet, credits: number): Wallet {
  const s = splitDebit(w, credits);
  if (!s.ok) throw new Error("Insufficient AI credits");
  return {
    allowance: w.allowance - s.fromAllowance,
    purchased: w.purchased - s.fromPurchased,
  };
}

export type CreditKind = "purchase" | "grant" | "refund";

/**
 * Add credits to the wallet. Purchases/refunds land in the permanent purchased
 * pool; grants (plan allowance, promos) land in the resetting allowance pool.
 */
export function applyCredit(w: Wallet, credits: number, kind: CreditKind): Wallet {
  if (credits <= 0) return w;
  return kind === "grant"
    ? { ...w, allowance: w.allowance + credits }
    : { ...w, purchased: w.purchased + credits };
}

/** Reset the allowance pool to a plan's monthly grant (purchased untouched). */
export function resetAllowance(w: Wallet, includedCredits: number): Wallet {
  return { ...w, allowance: Math.max(0, includedCredits) };
}

// ── Ledger (append-only source of truth) ─────────────────────────────────────

export interface LedgerEntry {
  type: "debit" | "purchase" | "grant" | "refund";
  /** Positive magnitude of credits for this entry. */
  credits: number;
}

/**
 * Derive the live wallet from the append-only ledger by replaying entries in
 * order (oldest→newest). Debits spend allowance-first; the ledger — not the
 * cached balance — is the auditable truth (plan §4.2). Entries are assumed
 * chronological; an allowance period-reset is represented by the writer as the
 * appropriate adjustment before the period's grant.
 */
export function deriveBalance(entries: LedgerEntry[]): Wallet {
  let w: Wallet = { allowance: 0, purchased: 0 };
  for (const e of entries) {
    const c = Math.max(0, e.credits);
    if (c === 0) continue;
    if (e.type === "debit") {
      // Clamp to available so a malformed ledger can't drive a pool negative.
      const s = splitDebit(w, Math.min(c, walletBalance(w)));
      w = { allowance: w.allowance - s.fromAllowance, purchased: w.purchased - s.fromPurchased };
    } else {
      w = applyCredit(w, c, e.type);
    }
  }
  return w;
}

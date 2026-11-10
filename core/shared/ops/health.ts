// The health page's arithmetic (docs/plan-operator-console.md §5, Phase 4):
// pure, so it is tested without Directus.

export type PushPlatform = "ios" | "android" | "macos" | "windows" | "linux" | "other";

export const PUSH_PLATFORM_LABEL: Readonly<Record<PushPlatform, string>> = {
  ios: "iPhone / iPad",
  android: "Android",
  macos: "Mac",
  windows: "Windows",
  linux: "Linux",
  other: "Other",
};

/** The platform a push subscription came from, by its user agent. iPadOS reports itself as a Mac; it counts as one. */
export function pushPlatform(ua: string | null | undefined): PushPlatform {
  const s = (ua ?? "").toLowerCase();
  if (/iphone|ipad|ipod/.test(s)) return "ios";
  if (/android/.test(s)) return "android";
  if (/mac os x|macintosh/.test(s)) return "macos";
  if (/windows/.test(s)) return "windows";
  if (/linux|cros/.test(s)) return "linux";
  return "other";
}

const DAY_MS = 86_400_000;
export const PUSH_ACTIVE_DAYS = 30;
export const PUSH_STALE_DAYS = 90;

export function summarizePush(
  rows: Array<{ user_agent?: string | null; last_used_at?: string | null; date_created?: string | null }>,
  now: Date = new Date()
) {
  const byPlatform = {} as Record<PushPlatform, { total: number; active: number; stale: number }>;
  for (const p of Object.keys(PUSH_PLATFORM_LABEL) as PushPlatform[]) byPlatform[p] = { total: 0, active: 0, stale: 0 };
  for (const r of rows) {
    const b = byPlatform[pushPlatform(r.user_agent)];
    b.total += 1;
    const seen = r.last_used_at ?? r.date_created ?? null;
    const age = seen ? now.getTime() - new Date(seen).getTime() : Infinity;
    if (r.last_used_at && age <= PUSH_ACTIVE_DAYS * DAY_MS) b.active += 1;
    if (age > PUSH_STALE_DAYS * DAY_MS) b.stale += 1;
  }
  return { total: rows.length, byPlatform };
}

export interface AiTransactionLike {
  type?: string | null;
  credits?: number | null;
  feature?: string | null;
  model?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_tokens?: number | null;
  date_created?: string | null;
}

/** Credits by kind and tokens by model, over whatever window the caller read. */
export function summarizeAiUsage(rows: AiTransactionLike[]) {
  const credits = { debit: 0, purchase: 0, grant: 0, refund: 0 };
  const byFeature: Record<string, number> = {};
  const byModel: Record<string, { credits: number; inputTokens: number; outputTokens: number; calls: number }> = {};
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let lastDebitAt: string | null = null;
  for (const r of rows) {
    const n = Math.abs(Number(r.credits) || 0);
    const type = (r.type ?? "") as keyof typeof credits;
    if (type in credits) credits[type] += n;
    if (type !== "debit") continue;
    inputTokens += r.input_tokens ?? 0;
    outputTokens += r.output_tokens ?? 0;
    cacheReadTokens += r.cache_read_tokens ?? 0;
    const feature = r.feature || "other";
    byFeature[feature] = (byFeature[feature] ?? 0) + n;
    const model = r.model || "unknown";
    const m = (byModel[model] ??= { credits: 0, inputTokens: 0, outputTokens: 0, calls: 0 });
    m.credits += n;
    m.inputTokens += r.input_tokens ?? 0;
    m.outputTokens += r.output_tokens ?? 0;
    m.calls += 1;
    if (r.date_created && (!lastDebitAt || r.date_created > lastDebitAt)) lastDebitAt = r.date_created;
  }
  return { credits, inputTokens, outputTokens, cacheReadTokens, byFeature, byModel, lastDebitAt };
}

/**
 * A wallet worth a look: under a tenth of its monthly allowance. One with no
 * allowance is a community without an AI plan, not one running out.
 */
export function walletLow(w: { balance_credits?: number | null; allowance_credits?: number | null }): boolean {
  const balance = Number(w.balance_credits) || 0;
  const allowance = Number(w.allowance_credits) || 0;
  return allowance > 0 && balance < allowance * 0.1;
}

/** Email events from SendGrid that mean a message didn't arrive. */
export const UNDELIVERED_EMAIL_EVENTS = ["bounce", "dropped", "spam_report", "deferred"] as const;

/** A send that has gone this long without progress is stuck. */
export const EMAIL_STUCK_MINUTES = 10;

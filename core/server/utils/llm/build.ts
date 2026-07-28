// Pure param builders for the Anthropic provider. Framework-free and SDK-call-
// free (only type-imports the SDK) so the money-sensitive assembly — cache_control
// breakpoints, adaptive thinking/effort gating, and the metered usage channels —
// is unit-testable without a live API. The provider (./provider.ts) is the only
// thing that actually calls Anthropic; it delegates all param shaping to here.

import type { SystemInput, StreamChatParams, LlmUsage } from "./types";

/** Default response budget, matching the chat/draft routes' historical value. */
export const DEFAULT_MAX_TOKENS = 1500;

/**
 * Normalize a SystemInput into Anthropic's `system` param: an array of typed
 * text blocks, each optionally carrying a cache_control breakpoint. Empty/blank
 * blocks are dropped. Returns `undefined` when there is nothing to send (so the
 * caller omits `system` entirely rather than passing `[]`).
 */
export function buildSystemBlocks(
  system: SystemInput | undefined
):
  | Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }>
  | undefined {
  if (!system) return undefined;
  const blocks = typeof system === "string" ? [{ text: system }] : system;
  const out = blocks
    .filter((b) => b && typeof b.text === "string" && b.text.trim().length > 0)
    .map((b) => ({
      type: "text" as const,
      text: b.text,
      ...(b.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
    }));
  return out.length ? out : undefined;
}

/**
 * Assemble Anthropic create/stream params from provider-neutral inputs. Adds
 * adaptive extended thinking and output effort ONLY when requested — Haiku (the
 * fast tier) rejects both, so callers pass them only on heavier tiers.
 */
export function buildCreateParams(p: StreamChatParams): Record<string, any> {
  const params: Record<string, any> = {
    model: p.model,
    max_tokens: p.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: p.messages,
  };
  const system = buildSystemBlocks(p.system);
  if (system) params.system = system;
  if (p.thinking) params.thinking = { type: "adaptive" };
  if (p.effort) params.output_config = { effort: p.effort };
  return params;
}

/**
 * Extract the four metered usage channels from an Anthropic `usage` block,
 * defaulting each to 0. This is the exact shape `chargeForCompletion` bills on,
 * so cache reads/writes flow through to the wallet correctly.
 */
export function llmUsageChannels(usage: any): Required<LlmUsage> {
  return {
    input_tokens: usage?.input_tokens ?? 0,
    output_tokens: usage?.output_tokens ?? 0,
    cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? 0,
  };
}

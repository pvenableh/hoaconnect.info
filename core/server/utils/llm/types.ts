// Provider-agnostic-ish LLM types for HOA Connect's assistant.
//
// HOA Connect runs its OWN AI (Anthropic-only by design — see
// docs/plan-earnest-parity-upgrade.md). The streaming path deliberately returns
// the Anthropic SDK stream rather than a neutral shape so we PRESERVE the three
// things a naive "systemPrompt: string" adapter would silently drop, all of
// which the credit economy depends on:
//   1. structured system blocks with cache_control (prompt caching → margin),
//   2. adaptive extended thinking + output effort on heavier tiers,
//   3. the full cache-token usage channels the wallet meters on.
// The tool path (Phase 4 HITL) returns a clean, plain result so callers don't
// leak the raw SDK.

import type Anthropic from "@anthropic-ai/sdk";

/** A system-prompt segment. `cache: true` marks a cache_control breakpoint. */
export interface SystemBlock {
  text: string;
  cache?: boolean;
}

/**
 * System prompt input: a plain string, or ordered blocks. The last block
 * carrying `cache: true` sets the cached prefix breakpoint (5-min ephemeral TTL).
 */
export type SystemInput = string | SystemBlock[];

/** A conversation turn replayed to the model. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Output effort hint — heavier tiers only (Haiku rejects it). */
export type Effort = "low" | "medium" | "high";

export interface StreamChatParams {
  model: string;
  system?: SystemInput;
  messages: ChatTurn[];
  maxTokens?: number;
  /** Adaptive extended thinking — heavier tiers only (Haiku rejects it). */
  thinking?: boolean;
  /** Output effort hint — heavier tiers only. */
  effort?: Effort;
}

/** Tool schema (mirrors Anthropic's tool shape, kept provider-neutral). */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

/** Full token-usage channels — mirrors Anthropic `usage`, fed to the credit meter. */
export interface LlmUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export interface ToolCompletionParams {
  model: string;
  system?: SystemInput;
  /**
   * Pre-built Anthropic message params so callers can construct multi-turn
   * tool_use / tool_result sequences correctly (Phase 4).
   */
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
  tools?: ToolDefinition[];
}

export interface ToolCompletion {
  text: string;
  toolCalls: ToolCall[];
  stopReason: string;
  usage: LlmUsage;
  rawContent: Anthropic.ContentBlock[];
}

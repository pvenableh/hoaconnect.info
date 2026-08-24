// The Anthropic-backed LLM provider + its cached factory. This is the ONE place
// that constructs the SDK client and issues calls; everything else (chat/draft
// routes, and Phase 4's tool loop) goes through getLlmProvider(). Key resolution
// and the "AI configured?" 503 gate are reused from anthropic.ts so behavior is
// identical to the pre-adapter routes.

import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "../anthropic";
import { buildCreateParams, buildSystemBlocks, llmUsageChannels, DEFAULT_MAX_TOKENS } from "./build";
import type {
  StreamChatParams,
  ToolCompletionParams,
  ToolCompletion,
  ToolCall,
} from "./types";

export class AnthropicProvider {
  readonly name = "anthropic";
  constructor(private client: Anthropic) {}

  /**
   * Streaming chat. Returns the SDK MessageStream so the caller keeps its
   * `for await (delta)` loop and `finalMessage()` — the latter carries the full
   * usage block (including cache_read/creation channels) the wallet meters on.
   */
  stream(params: StreamChatParams) {
    return this.client.messages.stream(buildCreateParams(params) as any);
  }

  /**
   * Non-streaming tool-use turn (Phase 4 HITL). Accepts pre-built Anthropic
   * message params so multi-turn tool_use / tool_result sequences are correct.
   */
  async completeWithTools(params: ToolCompletionParams): Promise<ToolCompletion> {
    const tools = (params.tools || []).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool.InputSchema,
    }));
    const res = await this.client.messages.create({
      model: params.model,
      max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: buildSystemBlocks(params.system) as any,
      messages: params.messages,
      tools: tools.length ? tools : undefined,
      // Only sent when the caller asked for it, and only alongside tools — a
      // tool_choice with no tools is a 400 from the API.
      ...(params.toolChoice && tools.length
        ? { tool_choice: { type: params.toolChoice } as Anthropic.ToolChoice }
        : {}),
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");
    const toolCalls: ToolCall[] = res.content
      .filter((b) => b.type === "tool_use")
      .map((b) => {
        const tb = b as Anthropic.ToolUseBlock;
        return { id: tb.id, name: tb.name, input: tb.input as Record<string, any> };
      });
    return {
      text,
      toolCalls,
      stopReason: res.stop_reason || "end_turn",
      usage: llmUsageChannels(res.usage),
      rawContent: res.content,
    };
  }
}

let _provider: AnthropicProvider | null = null;

/**
 * The configured LLM provider (cached singleton). Throws a 503 (via getAnthropic)
 * when ANTHROPIC_API_KEY is missing — the same gate the routes relied on before,
 * so opening a stream still fails fast and friendly when AI is unconfigured.
 */
export function getLlmProvider(): AnthropicProvider {
  if (_provider) return _provider;
  _provider = new AnthropicProvider(getAnthropic());
  return _provider;
}

import { describe, it, expect } from "vitest";
import {
  buildSystemBlocks,
  buildCreateParams,
  llmUsageChannels,
  DEFAULT_MAX_TOKENS,
} from "#core/server/utils/llm/build";

describe("buildSystemBlocks", () => {
  it("returns undefined for empty/blank input", () => {
    expect(buildSystemBlocks(undefined)).toBeUndefined();
    expect(buildSystemBlocks("")).toBeUndefined();
    expect(buildSystemBlocks("   ")).toBeUndefined();
    expect(buildSystemBlocks([])).toBeUndefined();
    expect(buildSystemBlocks([{ text: "" }, { text: "  " }])).toBeUndefined();
  });

  it("wraps a plain string as one uncached text block", () => {
    expect(buildSystemBlocks("hello")).toEqual([{ type: "text", text: "hello" }]);
  });

  it("adds a cache_control breakpoint only on cached blocks", () => {
    const out = buildSystemBlocks([
      { text: "stable prompt" },
      { text: "org context", cache: true },
      { text: "rag passages" },
    ]);
    expect(out).toEqual([
      { type: "text", text: "stable prompt" },
      { type: "text", text: "org context", cache_control: { type: "ephemeral" } },
      { type: "text", text: "rag passages" },
    ]);
  });

  it("drops blank blocks but keeps order of the rest", () => {
    const out = buildSystemBlocks([
      { text: "a" },
      { text: "" },
      { text: "b", cache: true },
    ]);
    expect(out).toEqual([
      { type: "text", text: "a" },
      { type: "text", text: "b", cache_control: { type: "ephemeral" } },
    ]);
  });
});

describe("buildCreateParams", () => {
  const messages = [{ role: "user" as const, content: "hi" }];

  it("defaults max_tokens and passes messages through", () => {
    const p = buildCreateParams({ model: "claude-haiku-4-5", messages });
    expect(p.model).toBe("claude-haiku-4-5");
    expect(p.max_tokens).toBe(DEFAULT_MAX_TOKENS);
    expect(p.messages).toBe(messages);
  });

  it("honors an explicit maxTokens", () => {
    const p = buildCreateParams({ model: "m", messages, maxTokens: 800 });
    expect(p.max_tokens).toBe(800);
  });

  it("omits system when there is nothing to send", () => {
    const p = buildCreateParams({ model: "m", messages, system: "   " });
    expect(p).not.toHaveProperty("system");
  });

  it("attaches cached system blocks when present", () => {
    const p = buildCreateParams({
      model: "m",
      messages,
      system: [{ text: "sys", cache: true }],
    });
    expect(p.system).toEqual([
      { type: "text", text: "sys", cache_control: { type: "ephemeral" } },
    ]);
  });

  it("adds thinking + effort only when requested (fast tier omits both)", () => {
    const fast = buildCreateParams({ model: "claude-haiku-4-5", messages });
    expect(fast).not.toHaveProperty("thinking");
    expect(fast).not.toHaveProperty("output_config");

    const heavy = buildCreateParams({
      model: "claude-sonnet-4-6",
      messages,
      thinking: true,
      effort: "medium",
    });
    expect(heavy.thinking).toEqual({ type: "adaptive" });
    expect(heavy.output_config).toEqual({ effort: "medium" });
  });
});

describe("llmUsageChannels", () => {
  it("maps all four channels and defaults missing ones to 0", () => {
    expect(
      llmUsageChannels({ input_tokens: 10, output_tokens: 20 })
    ).toEqual({
      input_tokens: 10,
      output_tokens: 20,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
  });

  it("preserves cache channels when present", () => {
    expect(
      llmUsageChannels({
        input_tokens: 1,
        output_tokens: 2,
        cache_read_input_tokens: 3,
        cache_creation_input_tokens: 4,
      })
    ).toEqual({
      input_tokens: 1,
      output_tokens: 2,
      cache_read_input_tokens: 3,
      cache_creation_input_tokens: 4,
    });
  });

  it("tolerates null/undefined usage", () => {
    expect(llmUsageChannels(null)).toEqual({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
  });
});

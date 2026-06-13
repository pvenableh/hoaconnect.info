// Client composable for the AI credit economy: wallet meter, the streaming
// "Draft with AI" call, and Stripe credit-pack top-ups. All money/metering
// lives server-side; this just reads the wallet and consumes the SSE stream.

import { splitDraftOutput } from "~~/shared/ai/draft";
import type { CreditPack } from "~~/shared/ai/credits";

export interface AiWalletSummary {
  walletId: string;
  balanceCredits: number;
  allowanceCredits: number;
  purchasedCredits: number;
  includedCredits: number;
  periodResetsAt: string | null;
  lowBalance: boolean;
  aiConfigured: boolean;
  packs: CreditPack[];
}

export interface StreamDraftOptions {
  instruction: string;
  subject?: string | null;
  content?: string | null;
  tier?: "fast" | "standard";
  /** Called on each token with the parsed subject (if any) and body-so-far. */
  onText: (parts: { subject: string | null; body: string }) => void;
}

export function useAiCredits(orgId: Ref<string | null | undefined>) {
  const summary = ref<AiWalletSummary | null>(null);
  const loading = ref(false);

  async function refresh() {
    if (!orgId.value) return;
    loading.value = true;
    try {
      summary.value = await $fetch<AiWalletSummary>("/api/ai/credits", {
        query: { orgId: orgId.value },
      });
    } catch {
      // 403 (not a comms actor) / 503 (unconfigured) → hide the UI gracefully.
      summary.value = null;
    } finally {
      loading.value = false;
    }
  }

  /** Kick off a Stripe Checkout for a pack; redirects to the hosted page. */
  async function buyPack(packId: string, returnPath: string) {
    if (!orgId.value) return;
    const { url } = await $fetch<{ url: string | null }>("/api/ai/credits/checkout", {
      method: "POST",
      body: { orgId: orgId.value, packId, returnPath },
    });
    if (url) window.location.href = url;
  }

  /**
   * Stream a draft. Resolves with the credits charged + new balance, or throws
   * with `.status` (402 = out of credits, 503 = AI not configured). Refreshes
   * the wallet on completion.
   */
  async function streamDraft(
    opts: StreamDraftOptions
  ): Promise<{ credits: number; balanceCredits: number }> {
    if (!orgId.value) throw new Error("No organization selected");

    const res = await fetch("/api/ai/draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        orgId: orgId.value,
        instruction: opts.instruction,
        subject: opts.subject ?? null,
        content: opts.content ?? null,
        tier: opts.tier ?? "fast",
      }),
    });

    if (!res.ok || !res.body) {
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        /* ignore */
      }
      throw Object.assign(new Error(data?.error || data?.message || "Draft failed"), {
        status: res.status,
        data,
      });
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    let result = { credits: 0, balanceCredits: summary.value?.balanceCredits ?? 0 };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        const payload = dataLine.slice(5).trim();
        if (!payload) continue;
        let msg: any;
        try {
          msg = JSON.parse(payload);
        } catch {
          continue;
        }
        if (msg.type === "delta") {
          full += msg.text;
          opts.onText(splitDraftOutput(full));
        } else if (msg.type === "done") {
          result = { credits: msg.credits, balanceCredits: msg.balanceCredits };
        } else if (msg.type === "error") {
          throw new Error(msg.message || "Draft failed");
        }
      }
    }

    await refresh();
    return result;
  }

  return { summary, loading, refresh, buyPack, streamDraft };
}

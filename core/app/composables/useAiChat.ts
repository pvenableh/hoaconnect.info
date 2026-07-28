// useAiChat — client state for the contextual AI assistant: the active
// conversation, its turns, the streaming consumer for POST /api/ai/chat, and
// the resume list. All money/metering lives server-side; this reads the stream
// and the persisted history. Mirrors useAiCredits.streamDraft for the SSE loop.

import type { ModelTier } from "#core/shared/ai/credits";

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  /** True while the assistant turn is still streaming. */
  pending?: boolean;
}

export interface ConversationSummary {
  id: string;
  title?: string | null;
  model?: string | null;
  date_updated?: string | null;
}

export function useAiChat(orgId: Ref<string | null | undefined>) {
  const { currentContext } = useAiContext();
  const { excludedKeys } = useAiAwareness();

  const conversationId = ref<string | null>(null);
  const messages = ref<ChatMessage[]>([]);
  const conversations = ref<ConversationSummary[]>([]);
  const isStreaming = ref(false);
  /** User-selectable model tier (default fast/Haiku). */
  const tier = ref<ModelTier>("fast");

  /** The entity the active thread is anchored to, e.g. "vendor:abc" — null when
   *  the conversation is general (page/route-scoped, not item-scoped). */
  const focusedEntityKey = ref<string | null>(null);

  function reset() {
    conversationId.value = null;
    messages.value = [];
  }

  /**
   * Resume the thread for whatever the user is currently looking at. When the
   * page has set an entity focus (member/vendor/project/ticket…), load that
   * item's most recent thread — or start a fresh one scoped to it (the next
   * send persists the scope). Returns true when an entity focus was handled.
   */
  async function hydrateForContext(): Promise<boolean> {
    const ctx = currentContext.value;
    const entityType = ctx.entityType;
    const entityId = ctx.entityId;
    const key = entityType && entityId ? `${entityType}:${entityId}` : null;
    focusedEntityKey.value = key;
    if (!key || !orgId.value) return false;
    try {
      const res = await $fetch<{ conversations: ConversationSummary[] }>(
        "/api/ai/conversations/by-entity",
        { query: { orgId: orgId.value, entityType, entityId } }
      );
      const latest = res.conversations?.[0];
      if (latest) {
        await loadConversation(latest.id);
      } else {
        reset();
      }
    } catch {
      reset();
    }
    return true;
  }

  async function fetchConversations() {
    if (!orgId.value) return;
    try {
      const res = await $fetch<{ conversations: ConversationSummary[] }>("/api/ai/conversations", {
        query: { orgId: orgId.value },
      });
      conversations.value = res.conversations || [];
    } catch {
      conversations.value = [];
    }
  }

  async function loadConversation(id: string) {
    if (!orgId.value) return;
    try {
      const res = await $fetch<{
        conversation: ConversationSummary;
        messages: { id: string; role: "user" | "assistant"; content?: string | null }[];
      }>("/api/ai/messages", { query: { orgId: orgId.value, conversationId: id } });
      conversationId.value = res.conversation.id;
      messages.value = (res.messages || []).map((m) => ({
        id: m.id,
        role: m.role,
        content: String(m.content ?? ""),
      }));
    } catch {
      // Unknown/foreign conversation — start fresh rather than error.
      reset();
    }
  }

  /**
   * Send a turn and stream the reply. Resolves with credits charged + new
   * balance, or throws with `.status` (402 = out of credits, 503 = AI not
   * configured) so the panel can react (e.g. open the buy-credits dialog).
   */
  async function send(text: string): Promise<{ credits: number; balanceCredits: number }> {
    if (!orgId.value) throw new Error("No organization selected");
    const trimmed = text.trim();
    if (!trimmed) return { credits: 0, balanceCredits: 0 };

    messages.value.push({ role: "user", content: trimmed });
    const assistant = reactive<ChatMessage>({ role: "assistant", content: "", pending: true });
    messages.value.push(assistant);
    isStreaming.value = true;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orgId: orgId.value,
          conversationId: conversationId.value,
          message: trimmed,
          tier: tier.value,
          context: currentContext.value,
          // Sources the user toggled OFF in the awareness chip (default none).
          excludedContext: excludedKeys.value,
        }),
      });

      if (!res.ok || !res.body) {
        let data: any = null;
        try {
          data = await res.json();
        } catch {
          /* ignore */
        }
        throw Object.assign(new Error(data?.error || data?.message || "Chat failed"), {
          status: res.status,
          data,
        });
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result = { credits: 0, balanceCredits: 0 };

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
          if (msg.type === "meta") {
            conversationId.value = msg.conversationId;
          } else if (msg.type === "delta") {
            assistant.content += msg.text;
          } else if (msg.type === "done") {
            result = { credits: msg.credits, balanceCredits: msg.balanceCredits };
          } else if (msg.type === "error") {
            throw new Error(msg.message || "Chat failed");
          }
        }
      }

      assistant.pending = false;
      // Surface the (possibly new) conversation in the resume list.
      fetchConversations();
      return result;
    } catch (err) {
      // Drop the empty assistant placeholder on failure; keep the user turn.
      if (assistant.content === "") {
        const i = messages.value.indexOf(assistant);
        if (i !== -1) messages.value.splice(i, 1);
      } else {
        assistant.pending = false;
      }
      throw err;
    } finally {
      isStreaming.value = false;
    }
  }

  return {
    conversationId,
    messages,
    conversations,
    isStreaming,
    tier,
    focusedEntityKey,
    reset,
    hydrateForContext,
    fetchConversations,
    loadConversation,
    send,
  };
}

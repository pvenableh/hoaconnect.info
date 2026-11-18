// useAiAssistant — global state for the slide-over AI assistant panel.
//
// The assistant is an ambient surface you pop open over the current page (like
// the Channels panel), not a full-page destination. A launcher button toggles
// it; deep links can open it on a specific conversation. Mirrors
// useChannelsPanel so the two overlays behave identically.

const isOpen = ref(false);
const activeConversationId = ref<string | null>(null);
// A prompt to auto-send once the panel opens (e.g. from an inline entity card's
// "ask about this" pill). Consumed once by the panel.
const pendingPrompt = ref<string | null>(null);
// A view to open on (the account menu's Assistant row opens the review queue,
// where the trust dial, what is waiting and what already ran live). Consumed
// once by the panel.
const requestedView = ref<"actions" | null>(null);

export const useAiAssistant = () => {
  const open = (conversationId?: string | null) => {
    if (conversationId !== undefined) activeConversationId.value = conversationId;
    isOpen.value = true;
  };
  /** Open the panel and auto-send `prompt` (lands in the focused item's thread). */
  const openWith = (prompt: string) => {
    pendingPrompt.value = prompt;
    isOpen.value = true;
  };
  /** Open the panel on its review queue: the dial, what waits, what ran. */
  const openReview = () => {
    requestedView.value = "actions";
    isOpen.value = true;
  };
  /** Read-and-clear the requested view (the panel watches for it). */
  const consumeRequestedView = (): "actions" | null => {
    const v = requestedView.value;
    requestedView.value = null;
    return v;
  };
  /** Read-and-clear the seeded prompt (the panel calls this on open). */
  const consumePendingPrompt = (): string | null => {
    const p = pendingPrompt.value;
    pendingPrompt.value = null;
    return p;
  };
  const close = () => {
    isOpen.value = false;
  };
  const toggle = () => {
    isOpen.value = !isOpen.value;
  };
  const setConversation = (id: string | null) => {
    activeConversationId.value = id;
  };

  return {
    isOpen,
    activeConversationId,
    open,
    openWith,
    openReview,
    requestedView,
    consumeRequestedView,
    consumePendingPrompt,
    close,
    toggle,
    setConversation,
  };
};

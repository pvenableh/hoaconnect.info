// useAiAssistant — global state for the slide-over AI assistant panel.
//
// The assistant is an ambient surface you pop open over the current page (like
// the Channels panel), not a full-page destination. A launcher button toggles
// it; deep links can open it on a specific conversation. Mirrors
// useChannelsPanel so the two overlays behave identically.

const isOpen = ref(false);
const activeConversationId = ref<string | null>(null);

export const useAiAssistant = () => {
  const open = (conversationId?: string | null) => {
    if (conversationId !== undefined) activeConversationId.value = conversationId;
    isOpen.value = true;
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

  return { isOpen, activeConversationId, open, close, toggle, setConversation };
};

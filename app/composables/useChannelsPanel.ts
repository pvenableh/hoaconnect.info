// useChannelsPanel — global state for the slide-over Channels panel.
//
// Channels is chat: an ambient surface you pop open over your current page, not a
// full-page destination. The dock's "Channels" button toggles this panel; deep
// links (notifications, search) can also open it on a specific channel. The old
// /admin/channels route still works as a fallback.

const isOpen = ref(false);
const activeChannelSlug = ref<string | null>(null);

export const useChannelsPanel = () => {
  const open = (channelSlug?: string | null) => {
    if (channelSlug !== undefined) activeChannelSlug.value = channelSlug;
    isOpen.value = true;
  };
  const close = () => {
    isOpen.value = false;
  };
  const toggle = () => {
    isOpen.value = !isOpen.value;
  };
  const setChannel = (slug: string | null) => {
    activeChannelSlug.value = slug;
  };

  return { isOpen, activeChannelSlug, open, close, toggle, setChannel };
};

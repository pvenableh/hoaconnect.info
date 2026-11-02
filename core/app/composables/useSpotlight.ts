/**
 * Spotlight (⌘K) open state — shared so every affordance drives the one
 * dialog: the Nav search pill, the ⌘K / Ctrl-K shortcut, and the mobile menu.
 * The host is `<AppSpotlight />`, mounted once in the workspace layouts.
 */
export function useSpotlight() {
  const isOpen = useState<boolean>("spotlightOpen", () => false);
  return {
    isOpen,
    open: () => (isOpen.value = true),
    close: () => (isOpen.value = false),
    toggle: () => (isOpen.value = !isOpen.value),
  };
}

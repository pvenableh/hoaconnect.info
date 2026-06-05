<script setup lang="ts">
// Immersive, full-viewport layout for the Channels workspace (Phase 8).
//
// Channels is a Slack-like "app within the app": it wants the whole window and
// its own internal scrolling, so unlike the default `auth` layout this one drops
// the floating dock, breadcrumbs, and footer and pins the height to the viewport
// (h-dvh). The top AppNav stays — it carries org identity, the notification bell,
// and the menu/avatar, which is the user's way back out to the rest of the app.
const { user } = useDirectusAuth();

// Apply the app theme class on <html> during SSR (mirrors auth.vue) to avoid a
// flash of the unthemed background on refresh.
const { initTheme, themeState } = useTheme();
const htmlThemeClass = computed(() => {
  const base = `theme-${themeState.style}-${themeState.mode}`;
  return themeState.mode === "dark" ? `${base} dark` : base;
});
useHead({ htmlAttrs: { class: htmlThemeClass } });
onMounted(() => initTheme());

// Initialize org context + notifications so the top nav (bell, identity) works.
const { isAdmin, isBoardMember, memberType, selectedOrgId } = await useSelectedOrg();
const { fetchNotifications, notifications } = useNotifications();

const audienceFilter = computed(() => {
  const audiences: string[] = ["all"];
  if (memberType.value === "owner") audiences.push("owners");
  else if (memberType.value === "tenant") audiences.push("tenants");
  if (isBoardMember.value || isAdmin.value) audiences.push("board members");
  return audiences;
});

const loadNotifications = async () => {
  if (!user.value || !selectedOrgId.value) return;
  try {
    await fetchNotifications(audienceFilter.value);
  } catch (error) {
    console.error("Failed to fetch notifications:", error);
  }
};

watch(() => selectedOrgId.value, loadNotifications);
onMounted(loadNotifications);
</script>

<template>
  <div class="h-dvh flex flex-col overflow-hidden bg-background">
    <AppNav />

    <!-- Full-height workspace; the channel page scrolls internally. -->
    <main class="flex-1 min-h-0">
      <slot />
    </main>

    <!-- No dock, no footer, no breadcrumbs — this is a focused workspace. -->
    <ClientOnly>
      <NotificationSheet />
      <NotificationToast
        v-if="notifications.length > 0"
        :initial-delay="1500"
        :max-title-length="50"
      />
    </ClientOnly>
  </div>
</template>

<!--
  AppAccountMenuBody — what the avatar opens (plan §2.4, "One account menu").

  The header used to carry seven controls on the right; the bell, the chat
  button and the assistant's button (with its autonomy ring) folded in here, so
  the avatar carries one badge for everything waiting. Top to bottom: who you
  are; the latest unread notifications, with "See all" opening the whole inbox
  in place (NotificationPanel, with a way back); Messages and the Assistant,
  each with its count; your own pages; Appearance and Tint; sign out.

  The same body in both presentations App/AccountMenu.vue picks: a popover from
  the avatar at sm and up, a bottom sheet on a phone. It IS the surface, so it
  groups with spacing and hairlines, never cards.
-->
<script setup lang="ts">
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { UnifiedNotification } from "#core/app/composables/useNotifications";

const props = defineProps<{
  user: { firstName?: string | null; lastName?: string | null; email?: string | null } | null;
  avatarUrl: string | null;
  statusBadge: string | null;
  isOnOrgPage: boolean;
  isCustomDomain: boolean;
  accountUrl: string;
  canOpenOps: boolean;
  showNotifications: boolean;
  showChat: boolean;
  chatUnread: number;
  showAssistant: boolean;
  assistantPending: number;
}>();
const emit = defineEmits<{ close: []; logout: [] }>();

const route = useRoute();
const channelsPanel = useChannelsPanel();
const aiAssistant = useAiAssistant();
const { notifications, getUnseenCount, openNotification, getNotificationStyle, formatDate } = useNotifications();

const view = ref<"menu" | "notifications">("menu");

const fullName = computed(() => [props.user?.firstName, props.user?.lastName].filter(Boolean).join(" "));
const initials = computed(() => `${props.user?.firstName?.[0] ?? ""}${props.user?.lastName?.[0] ?? ""}`);

/** The three newest unread; the rest are one tap away ("See all"). */
const latest = computed(() =>
  (notifications.value as UnifiedNotification[]).filter((n) => !n.isRead).slice(0, 3)
);
const cap = (n: number) => (n > 99 ? "99+" : String(n));

function openNote(n: UnifiedNotification) {
  openNotification(n);
  emit("close");
}
function openChat() {
  emit("close");
  channelsPanel.open();
}
function openAssistant() {
  emit("close");
  aiAssistant.openReview();
}
</script>

<template>
  <div class="account-menu" data-account-menu>
    <template v-if="view === 'menu'">
      <!-- Who -->
      <div class="account-menu__who">
        <Avatar class="size-10 shrink-0">
          <AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="fullName" />
          <AvatarFallback>{{ initials }}</AvatarFallback>
        </Avatar>
        <div class="min-w-0">
          <p class="type-card truncate">{{ fullName }}</p>
          <p v-if="user?.email" class="type-meta truncate">{{ user.email }}</p>
          <span v-if="statusBadge" class="account-menu__role type-micro">{{ statusBadge }}</span>
        </div>
      </div>

      <!-- Notifications: the newest unread, and the way to all of them. -->
      <section v-if="showNotifications" class="account-menu__group" aria-labelledby="account-menu-notifications">
        <div class="account-menu__head">
          <p id="account-menu-notifications" class="type-micro">
            Notifications
            <span v-if="getUnseenCount > 0" class="account-menu__count text-xs">{{ cap(getUnseenCount) }}</span>
          </p>
          <button type="button" class="account-menu__link text-sm" data-account-menu-all @click="view = 'notifications'">
            See all
          </button>
        </div>
        <p v-if="!latest.length" class="type-meta account-menu__empty">You're all caught up.</p>
        <button
          v-for="n in latest"
          :key="n.id"
          type="button"
          class="account-menu__note"
          @click="openNote(n)"
        >
          <span
            class="account-menu__note-icon"
            :class="[getNotificationStyle(n).bg, getNotificationStyle(n).text]"
          >
            <Icon :name="'lucide:' + getNotificationStyle(n).icon" class="size-4" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="account-menu__note-title text-sm">{{ n.title }}</span>
            <span v-if="n.subtitle" class="account-menu__note-text text-sm">{{ n.subtitle }}</span>
          </span>
          <span class="account-menu__note-time text-xs">{{ formatDate(n.date) }}</span>
        </button>
      </section>

      <!-- Messages and the assistant: what used to be two header buttons. -->
      <div v-if="showChat || showAssistant" class="account-menu__group">
        <button v-if="showChat" type="button" class="account-menu__row text-base" data-account-menu-chat @click="openChat">
          <Icon name="i-lucide-messages-square" class="account-menu__icon" />
          Messages
          <span v-if="chatUnread > 0" class="account-menu__meta text-sm">
            <span class="account-menu__count text-xs">{{ cap(chatUnread) }}</span>
          </span>
        </button>
        <button v-if="showAssistant" type="button" class="account-menu__row text-base" data-account-menu-assistant @click="openAssistant">
          <Icon name="i-lucide-sparkles" class="account-menu__icon" />
          Assistant
          <span class="account-menu__meta text-sm">
            <template v-if="assistantPending > 0">
              <span class="account-menu__count text-xs">{{ cap(assistantPending) }}</span> waiting
            </template>
            <template v-else>Review and autonomy</template>
          </span>
        </button>
      </div>

      <!-- Your own pages. -->
      <nav class="account-menu__group" aria-label="Your account">
        <a v-if="isCustomDomain" :href="accountUrl" target="_blank" rel="noopener" class="account-menu__row text-base">
          <Icon name="i-lucide-user" class="account-menu__icon" />
          My HOA Connect profile
          <Icon name="i-lucide-external-link" class="account-menu__meta size-3.5" />
        </a>
        <NuxtLink v-else to="/account" class="account-menu__row text-base" @click="emit('close')">
          <Icon name="i-lucide-user" class="account-menu__icon" />
          My profile
        </NuxtLink>
        <NuxtLink
          v-if="isOnOrgPage"
          :to="`/${route.params.slug}/profile`"
          class="account-menu__row text-base"
          @click="emit('close')"
        >
          <Icon name="i-lucide-home" class="account-menu__icon" />
          My household
        </NuxtLink>
        <a
          v-if="isOnOrgPage"
          :href="`/${route.params.slug}?preview`"
          target="_blank"
          rel="noopener"
          class="account-menu__row text-base"
        >
          <Icon name="i-lucide-external-link" class="account-menu__icon" />
          View public site
        </a>
        <NuxtLink v-if="canOpenOps && !isCustomDomain" to="/ops" class="account-menu__row text-base" @click="emit('close')">
          <Icon name="i-lucide-gauge" class="account-menu__icon" />
          Operations
        </NuxtLink>
        <NuxtLink
          v-if="!isCustomDomain"
          :to="{ path: '/support', query: isOnOrgPage ? { from: route.fullPath } : {} }"
          class="account-menu__row text-base"
          @click="emit('close')"
        >
          <Icon name="i-lucide-life-buoy" class="account-menu__icon" />
          Help &amp; support
        </NuxtLink>
      </nav>

      <!-- Appearance (Light, Dark, Auto) and Tint: the person's own, so they
           show everywhere, with or without a community. -->
      <div class="account-menu__group account-menu__appearance">
        <AppAppearanceSettings />
      </div>

      <div class="account-menu__group">
        <button type="button" class="account-menu__row account-menu__row--destructive text-base" @click="emit('logout')">
          <Icon name="i-lucide-log-out" class="account-menu__icon" />
          Sign out
        </button>
      </div>
    </template>

    <!-- The whole inbox, in place. -->
    <NotificationPanel v-else list-class="account-menu__inbox" @close="emit('close')">
      <template #back>
        <button type="button" class="account-menu__back" aria-label="Back to the menu" @click="view = 'menu'">
          <Icon name="lucide:chevron-left" class="size-4" />
        </button>
      </template>
    </NotificationPanel>
  </div>
</template>

<style scoped>
.account-menu {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.account-menu__who {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.25rem 0.5rem 0.75rem;
}
.account-menu__role {
  display: inline-flex;
  margin-top: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: var(--theme-bg-secondary);
  color: var(--theme-text-secondary);
}

/* Groups are separated by a hairline, not boxed: the menu is the surface. */
.account-menu__group {
  display: flex;
  flex-direction: column;
  padding: 0.375rem 0;
  border-top: 1px solid var(--theme-border-light);
}
.account-menu__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.25rem 0.5rem;
}
.account-menu__head .type-micro {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}
.account-menu__link {
  font-weight: 500;
  color: var(--theme-link-color);
  border-radius: 0.375rem;
}
.account-menu__link:hover {
  color: var(--theme-link-hover);
}
.account-menu__empty {
  padding: 0.25rem 0.5rem 0.375rem;
}

.account-menu__count {
  display: inline-grid;
  place-items: center;
  min-width: 1.25rem;
  height: 1.125rem;
  padding: 0 0.375rem;
  border-radius: 999px;
  background: var(--destructive);
  color: var(--destructive-foreground);
  font-weight: 700;
  letter-spacing: 0;
}

.account-menu__note {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  width: 100%;
  padding: 0.5rem;
  border-radius: 0.75rem;
  text-align: left;
  transition: background-color var(--motion-fast, 160ms) ease;
}
.account-menu__note:hover {
  background: var(--theme-bg-secondary);
}
.account-menu__note-icon {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  flex-shrink: 0;
}
.account-menu__note-title {
  display: block;
  font-weight: 600;
  color: var(--theme-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-menu__note-text {
  display: block;
  margin-top: 0.125rem;
  color: var(--theme-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-menu__note-time {
  flex-shrink: 0;
  color: var(--theme-text-muted);
}

.account-menu__row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  min-height: 2.5rem;
  padding: 0 0.5rem;
  border-radius: 0.625rem;
  font-weight: 500;
  color: var(--theme-text-primary);
  text-align: left;
  transition: background-color var(--motion-fast, 160ms) ease;
}
.account-menu__row:hover {
  background: var(--theme-bg-secondary);
}
.account-menu__icon {
  width: 1.125rem;
  height: 1.125rem;
  flex-shrink: 0;
  color: var(--theme-text-tertiary);
}
.account-menu__meta {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-weight: 400;
  color: var(--theme-text-muted);
}
.account-menu__row--destructive,
.account-menu__row--destructive .account-menu__icon {
  color: var(--destructive);
}
.account-menu__appearance {
  padding-inline: 0.5rem;
}

.account-menu__back {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  margin-left: -0.5rem;
  border-radius: 999px;
  color: var(--theme-text-secondary);
}
.account-menu__back:hover {
  background: var(--theme-bg-secondary);
  color: var(--theme-text-primary);
}
.account-menu__note:focus-visible,
.account-menu__row:focus-visible,
.account-menu__link:focus-visible,
.account-menu__back:focus-visible {
  outline: 2px solid var(--theme-accent-primary);
  outline-offset: 1px;
}
/* The inbox's own list, inside the menu: tall, but the menu still fits. */
:deep(.account-menu__inbox) {
  max-height: min(60vh, 32rem);
}
</style>

<!--
  AppAccountMenu — the avatar in the header, and the one badge for what waits
  in its menu: unread notifications and the assistant's actions waiting for
  review (each only where this person sees that surface). Messages has its own
  button and badge beside it (App/Nav.vue, Session 18).

  It opens App/AccountMenuBody.vue: as a popover under the avatar from sm up,
  and as a bottom sheet on a phone, where the menu is long and the thumb is at
  the bottom. One `open`, so a resize while it is open never leaves both up.
-->
<script setup lang="ts">
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const props = defineProps<{
  user: { firstName?: string | null; lastName?: string | null; email?: string | null } | null;
  avatarUrl: string | null;
  statusBadge: string | null;
  isOnOrgPage: boolean;
  isCustomDomain: boolean;
  accountUrl: string;
  canOpenOps: boolean;
  showNotifications: boolean;
  showAssistant: boolean;
  assistantPending: number;
}>();
const emit = defineEmits<{ logout: [] }>();

const route = useRoute();
const { getUnseenCount } = useNotifications();

const waiting = computed(
  () =>
    (props.showNotifications ? getUnseenCount.value : 0) +
    (props.showAssistant ? props.assistantPending : 0)
);
const badgeText = computed(() => (waiting.value > 9 ? "9+" : String(waiting.value)));
const label = computed(() =>
  waiting.value > 0 ? `Account and notifications, ${waiting.value} waiting` : "Account and notifications"
);
const initials = computed(() => `${props.user?.firstName?.[0] ?? ""}${props.user?.lastName?.[0] ?? ""}`);

// Below sm the header is the phone's: the menu rises from the bottom.
const isPhone = ref(false);
let mq: MediaQueryList | null = null;
const onMq = (e: MediaQueryListEvent) => (isPhone.value = e.matches);
onMounted(() => {
  if (!window.matchMedia) return;
  mq = window.matchMedia("(max-width: 639px)");
  isPhone.value = mq.matches;
  mq.addEventListener("change", onMq);
});
onBeforeUnmount(() => mq?.removeEventListener("change", onMq));

const open = ref(false);
watch(
  () => route.fullPath,
  () => (open.value = false)
);

// The body's props are this component's, minus nothing.
const bodyProps = computed(() => ({ ...props }));
</script>

<template>
  <Popover :open="open && !isPhone" @update:open="(v: boolean) => (open = v)">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="account-trigger"
        :class="{ 'is-active': open }"
        :aria-label="label"
        aria-haspopup="dialog"
        :aria-expanded="open"
        data-account-menu-trigger
      >
        <span class="account-trigger__ring">
          <Avatar class="size-8">
            <AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="''" />
            <AvatarFallback class="account-trigger__fallback text-xs">{{ initials }}</AvatarFallback>
          </Avatar>
        </span>
        <span v-if="waiting > 0" class="account-trigger__badge text-[0.625rem]" aria-hidden="true">{{ badgeText }}</span>
      </button>
    </PopoverTrigger>
    <PopoverContent
      align="end"
      :side-offset="6"
      class="w-[23rem] max-h-[min(85vh,46rem)] overflow-y-auto rounded-2xl p-2"
    >
      <AppAccountMenuBody v-bind="bodyProps" @close="open = false" @logout="emit('logout')" />
    </PopoverContent>
  </Popover>

  <AppBottomSheet
    v-if="isPhone"
    :open="open"
    always-sheet
    title="Account"
    max-height="92vh"
    @update:open="(v: boolean) => (open = v)"
  >
    <AppAccountMenuBody v-bind="bodyProps" @close="open = false" @logout="emit('logout')" />
  </AppBottomSheet>
</template>

<style scoped>
.account-trigger {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin: -0.375rem -0.375rem -0.375rem 0;
  border-radius: 999px;
  scale: 1;
  transition: scale var(--motion-fast, 160ms) var(--spring);
}
.account-trigger:active {
  scale: 0.92;
}
/* The header pill's ring: faint at rest, the accent on hover, focus and open. */
.account-trigger__ring {
  display: grid;
  place-items: center;
  border-radius: 999px;
  box-shadow: var(--glass-rim-shadow);
  transition: box-shadow 180ms ease;
}
.account-trigger:hover .account-trigger__ring,
.account-trigger:focus-visible .account-trigger__ring,
.account-trigger.is-active .account-trigger__ring {
  box-shadow:
    0 0 0 2px var(--theme-bg-elevated),
    0 0 0 3px var(--theme-accent-primary);
}
.account-trigger:focus-visible {
  outline: none;
}
.account-trigger__fallback {
  background: var(--theme-accent-primary);
  color: var(--theme-button-text);
  font-weight: 600;
}
.account-trigger__badge {
  position: absolute;
  top: 0.125rem;
  right: 0;
  min-width: 1.125rem;
  height: 1.125rem;
  padding: 0 0.3125rem;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: var(--destructive);
  color: var(--destructive-foreground);
  font-weight: 700;
  line-height: 1;
  box-shadow: 0 0 0 2px var(--theme-bg-elevated);
  pointer-events: none;
  transform-origin: center;
  animation: badge-pop var(--motion-base, 240ms) var(--spring) both;
}
@media (prefers-reduced-motion: reduce) {
  .account-trigger,
  .account-trigger:active {
    scale: 1;
    transition: none;
  }
  .account-trigger__badge {
    animation: none;
  }
}
</style>

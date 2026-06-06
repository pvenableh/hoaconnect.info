<!--
  Signed-in visitor's avatar, shown top-right on the landing. Links to the
  resident dashboard. Uses the Directus avatar when present, else a generated
  ui-avatars.com fallback.
-->
<template>
  <a
    href="/dashboard"
    class="landing-glass-btn w-10 h-10 overflow-hidden p-0"
    :title="`${displayName} — Resident portal`"
  >
    <img :src="src" :alt="displayName" class="w-full h-full object-cover rounded-full" />
  </a>
</template>

<script setup lang="ts">
const props = defineProps<{ user: any }>();
const config = useRuntimeConfig();

const displayName = computed(() =>
  [props.user?.first_name, props.user?.last_name].filter(Boolean).join(" ") || "Resident"
);

const src = computed(() => {
  if (props.user?.avatar) {
    const id = typeof props.user.avatar === "object" ? props.user.avatar.id : props.user.avatar;
    return `${config.public.directus.url}/assets/${id}?key=small`;
  }
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName.value)}&background=ffffff&color=222222`;
});
</script>

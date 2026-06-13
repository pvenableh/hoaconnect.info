<script setup lang="ts">
/**
 * Public "view this email on the web" page.
 *
 *   /{org-slug}/announcements/email/{web_slug-or-id}
 *
 * The org slug scopes the lookup (so web_slugs only need to be unique per org);
 * the id always works as a fallback. We resolve the friendly ref to a concrete
 * email id, then render the standalone email document in a full-viewport iframe
 * so its own styles stay isolated from the app shell. No auth — emails are
 * viewable by anyone with the link.
 */
definePageMeta({
  layout: false,
});

const route = useRoute();
const orgSlug = computed(() => String(route.params.slug || ""));
const ref_ = computed(() => String(route.params.id || ""));

const { data, error } = await useFetch<{ id: string; subject: string }>(
  "/api/email/resolve",
  { query: { org: orgSlug, ref: ref_ } }
);

if (error.value || !data.value?.id) {
  throw createError({ statusCode: 404, statusMessage: "Email not found" });
}

const viewUrl = computed(() => `/api/email/view/${data.value!.id}`);

useHead({
  title: data.value?.subject || "Email",
});
</script>

<template>
  <div class="email-web-view">
    <iframe :src="viewUrl" title="Email" frameborder="0" />
  </div>
</template>

<style scoped>
.email-web-view {
  position: fixed;
  inset: 0;
  background: #ffffff;
}
.email-web-view iframe {
  width: 100%;
  height: 100%;
  border: 0;
  animation: email-fade-in var(--motion-page, 300ms) ease both;
}
@keyframes email-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .email-web-view iframe {
    animation: none;
  }
}
</style>

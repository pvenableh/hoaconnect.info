<script setup lang="ts">
// `/{slug}/admin` has no page of its own — the admin dashboard IS the org root
// (`/{slug}`), and every real admin screen lives a level deeper under
// `/admin/*`. Without this shim the bare path 404s, and it is reachable three
// ways: typed directly, via `org-redirect.global` bouncing a signed-in user off
// the top-level `/admin`, and via `orgScopedRedirect` mapping a custom domain's
// `/admin` onto the host org. All three used to dead-end.
//
// No `admin` middleware on purpose: the org root is role-aware (admins get the
// admin dashboard, members the member one), so a member who lands here should be
// shown their own home rather than bounced by a permission check.
definePageMeta({
  middleware: [
    (to) => navigateTo(`/${to.params.slug}`, { replace: true }),
  ],
});
</script>

<template>
  <!-- Never rendered — the middleware redirects before this page mounts. -->
  <div />
</template>

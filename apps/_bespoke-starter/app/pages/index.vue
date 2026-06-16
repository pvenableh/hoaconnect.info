<script setup lang="ts">
// Public landing for the single bound building. No auth, no org-picker — the
// org is resolved from NUXT_PUBLIC_ORG_SLUG (or the request domain) via core.
const { ensure, boundSlug } = useBoundOrg();
const { data: org } = await useAsyncData("bound-org", () => ensure());

useHead(() => ({
  title: org.value?.name ? `${org.value.name} — Residents` : "Residents",
}));
</script>

<template>
  <main class="landing">
    <section class="hero">
      <p class="eyebrow">Welcome to</p>
      <h1>{{ org?.name || "Your Building" }}</h1>
      <p class="sub">
        The private resident portal{{ boundSlug ? ` for ${boundSlug}` : "" }}.
        Payments, documents, announcements and requests — all in one place.
      </p>
      <NuxtLink class="cta" to="/auth/login">Resident sign in →</NuxtLink>
    </section>

    <p v-if="!org" class="note">
      No bound organization resolved. Set <code>NUXT_PUBLIC_ORG_SLUG</code> in
      your env (or bind a verified custom domain). See README.
    </p>
  </main>
</template>

<style scoped>
.landing {
  max-width: 720px;
  margin: 0 auto;
  padding: 12vh 24px;
}
.eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 12px;
  opacity: 0.6;
  margin: 0 0 8px;
}
.hero h1 {
  font-size: clamp(40px, 8vw, 72px);
  line-height: 1.05;
  margin: 0 0 16px;
  font-weight: 600;
}
.sub {
  font-size: 18px;
  line-height: 1.6;
  opacity: 0.75;
  max-width: 48ch;
}
.cta {
  display: inline-block;
  margin-top: 28px;
  padding: 12px 22px;
  border-radius: 999px;
  background: #111;
  color: #fff;
  text-decoration: none;
  font-weight: 500;
}
.note {
  margin-top: 48px;
  padding: 16px;
  border: 1px dashed #ccc;
  border-radius: 10px;
  font-size: 14px;
  opacity: 0.8;
}
code {
  background: rgba(0, 0, 0, 0.06);
  padding: 1px 6px;
  border-radius: 4px;
}
</style>

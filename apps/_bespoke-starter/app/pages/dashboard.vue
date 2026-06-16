<script setup lang="ts">
// Authenticated resident dashboard. `auth` middleware (core) redirects guests to
// /auth/login. Data comes entirely from core composables + /api/* — proving a
// bespoke design can reuse the shared backend with zero duplication.
definePageMeta({ middleware: "auth" });

const { user, logout } = useDirectusAuth();
// useSelectedOrg is locked to the bound org (NUXT_PUBLIC_ORG_SLUG) in core, so
// there is exactly one org and no picker.
const { currentOrg, currentRole, isAdmin, memberType, isLoading } =
  await useSelectedOrg();

const orgName = computed(
  () => currentOrg.value?.organization?.name || "Your building",
);

async function onLogout() {
  await logout();
  await navigateTo("/");
}
</script>

<template>
  <main class="dash">
    <header class="bar">
      <strong>{{ orgName }}</strong>
      <button class="link" @click="onLogout">Sign out</button>
    </header>

    <section class="welcome">
      <h1>Welcome{{ user?.firstName ? `, ${user.firstName}` : "" }}</h1>
      <p class="muted">{{ user?.email }}</p>
    </section>

    <section v-if="isLoading" class="muted">Loading your membership…</section>

    <section v-else class="grid">
      <article class="tile">
        <p class="k">Building</p>
        <p class="v">{{ orgName }}</p>
      </article>
      <article class="tile">
        <p class="k">Your role</p>
        <p class="v">{{ isAdmin ? "Admin" : "Member" }}</p>
      </article>
      <article class="tile">
        <p class="k">Member type</p>
        <p class="v">{{ memberType || "—" }}</p>
      </article>
    </section>

    <p class="note">
      This data is served by the shared core layer (auth, <code>useSelectedOrg</code>,
      and the <code>/api/*</code> routes). Replace this page with the building's
      bespoke resident experience.
    </p>
  </main>
</template>

<style scoped>
.dash {
  max-width: 880px;
  margin: 0 auto;
  padding: 32px 24px 64px;
}
.bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}
.link {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.7;
}
.welcome {
  padding: 36px 0 8px;
}
.welcome h1 {
  margin: 0;
  font-size: 34px;
  font-weight: 600;
}
.muted {
  opacity: 0.6;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
  margin: 24px 0;
}
.tile {
  padding: 18px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 14px;
}
.k {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  opacity: 0.55;
  margin: 0 0 6px;
}
.v {
  font-size: 20px;
  margin: 0;
  font-weight: 500;
}
.note {
  margin-top: 28px;
  font-size: 14px;
  opacity: 0.7;
}
code {
  background: rgba(0, 0, 0, 0.06);
  padding: 1px 6px;
  border-radius: 4px;
}
</style>

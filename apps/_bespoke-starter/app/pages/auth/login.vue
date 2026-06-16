<script setup lang="ts">
// Resident login. Uses the core `useDirectusAuth` composable, which posts to the
// core /api/auth/login route and sets THIS app's own same-origin session cookie
// (its own NUXT_SESSION_PASSWORD) against the shared Directus backend.
// `guest` middleware (from core) bounces already-authenticated users to /dashboard.
definePageMeta({ middleware: "guest" });

const { login } = useDirectusAuth();
const route = useRoute();

const email = ref("");
const password = ref("");
const error = ref("");
const busy = ref(false);

async function onSubmit() {
  busy.value = true;
  error.value = "";
  try {
    await login(email.value, password.value);
    await navigateTo((route.query.redirect as string) || "/dashboard");
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || "Sign in failed";
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="auth">
    <form class="card" @submit.prevent="onSubmit">
      <h1>Resident sign in</h1>
      <label>
        Email
        <input v-model="email" type="email" autocomplete="email" required />
      </label>
      <label>
        Password
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
        />
      </label>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="submit" :disabled="busy">
        {{ busy ? "Signing in…" : "Sign in" }}
      </button>
      <NuxtLink class="back" to="/">← Back</NuxtLink>
    </form>
  </main>
</template>

<style scoped>
.auth {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 24px;
}
.card {
  width: 100%;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 28px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 16px;
}
.card h1 {
  margin: 0 0 8px;
  font-size: 22px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  opacity: 0.8;
}
input {
  padding: 10px 12px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  font-size: 15px;
}
button {
  margin-top: 6px;
  padding: 11px;
  border: none;
  border-radius: 8px;
  background: #111;
  color: #fff;
  font-weight: 500;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.error {
  color: #b00020;
  font-size: 13px;
  margin: 0;
}
.back {
  text-align: center;
  font-size: 13px;
  opacity: 0.6;
  text-decoration: none;
}
</style>

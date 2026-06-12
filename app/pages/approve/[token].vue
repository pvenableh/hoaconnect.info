<script setup lang="ts">
/**
 * Public milestone-approval page — reached via an unguessable, expiring link
 * (/approve/{token}). No auth: a board member can approve straight from their
 * inbox. Shows only the one milestone the token unlocks; everything else is
 * resolved server-side and never exposed.
 */
definePageMeta({ layout: false });

const route = useRoute();
const token = computed(() => String(route.params.token || ""));

interface ApprovalInfo {
  title: string;
  description?: string | null;
  type?: string | null;
  event_date?: string | null;
  end_date?: string | null;
  cost_amount?: number | string | null;
  project_title?: string | null;
  org_name?: string | null;
}

const { data, error, pending } = await useAsyncData(`approval-${token.value}`, () =>
  $fetch<ApprovalInfo>(`/api/public/event-approval/${token.value}`).catch((e: any) => {
    throw createError({ statusCode: e?.statusCode || 404, statusMessage: e?.statusMessage || e?.data?.message || "This approval link is no longer valid." });
  })
);

const name = ref("");
const note = ref("");
const submitting = ref(false);
const done = ref<null | "approved" | "rejected">(null);
const submitError = ref("");

const fmt = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null;
const money = (v: number | string | null | undefined) =>
  v != null && v !== "" ? `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : null;

async function decide(decision: "approved" | "rejected") {
  if (submitting.value) return;
  submitting.value = true;
  submitError.value = "";
  try {
    await $fetch(`/api/public/event-approval/${token.value}`, {
      method: "POST",
      body: { decision, name: name.value.trim(), note: note.value.trim() },
    });
    done.value = decision;
  } catch (e: any) {
    submitError.value = e?.data?.message || e?.statusMessage || "Something went wrong. The link may have expired.";
  } finally {
    submitting.value = false;
  }
}

useHead({ title: "Milestone approval" });
</script>

<template>
  <div class="approve-page">
    <div class="approve-card">
      <div v-if="pending" class="py-12 text-center text-stone-400">Loading…</div>

      <div v-else-if="error" class="text-center py-8">
        <div class="icon-bubble icon-bubble--muted"><Icon name="lucide:link-2-off" class="w-6 h-6" /></div>
        <h1 class="text-lg font-semibold text-stone-900 dark:text-stone-100 mt-3">Link no longer valid</h1>
        <p class="text-sm text-stone-500 mt-1">This approval link has expired or was already used.</p>
      </div>

      <div v-else-if="done" class="text-center py-8">
        <div class="icon-bubble" :class="done === 'approved' ? 'icon-bubble--ok' : 'icon-bubble--warn'">
          <Icon :name="done === 'approved' ? 'lucide:check' : 'lucide:x'" class="w-7 h-7" />
        </div>
        <h1 class="text-xl font-semibold text-stone-900 dark:text-stone-100 mt-3">
          {{ done === "approved" ? "Approved" : "Sent back" }}
        </h1>
        <p class="text-sm text-stone-500 mt-1">
          Thank you — your decision on “{{ data!.title }}” was recorded. You can close this window.
        </p>
      </div>

      <div v-else-if="data">
        <p v-if="data.org_name" class="text-[11px] uppercase tracking-[0.2em] text-stone-400 text-center">{{ data.org_name }}</p>
        <h1 class="text-xl font-semibold text-stone-900 dark:text-stone-100 text-center mt-1">Approval requested</h1>
        <p class="text-sm text-stone-500 text-center mt-1">A milestone is awaiting your decision.</p>

        <div class="detail-box mt-5">
          <p v-if="data.project_title" class="text-xs text-stone-400">{{ data.project_title }}</p>
          <p class="text-base font-semibold text-stone-900 dark:text-stone-100">{{ data.title }}</p>
          <p v-if="data.description" class="text-sm text-stone-500 mt-1 whitespace-pre-line">{{ data.description }}</p>
          <dl class="mt-3 grid grid-cols-2 gap-y-2 text-sm">
            <template v-if="fmt(data.event_date)">
              <dt class="text-stone-400">Date</dt>
              <dd class="text-stone-700 dark:text-stone-300 text-right">
                {{ fmt(data.event_date) }}<span v-if="fmt(data.end_date) && data.end_date !== data.event_date"> – {{ fmt(data.end_date) }}</span>
              </dd>
            </template>
            <template v-if="money(data.cost_amount)">
              <dt class="text-stone-400">Amount</dt>
              <dd class="text-stone-700 dark:text-stone-300 text-right font-medium">{{ money(data.cost_amount) }}</dd>
            </template>
          </dl>
        </div>

        <div class="mt-5 space-y-3">
          <input v-model="name" type="text" placeholder="Your name (optional)" class="field" />
          <textarea v-model="note" rows="2" placeholder="Add a note (optional)" class="field resize-none" />
        </div>

        <p v-if="submitError" class="text-sm text-red-600 mt-3 text-center">{{ submitError }}</p>

        <div class="mt-5 flex gap-2">
          <button type="button" class="btn btn--ghost" :disabled="submitting" @click="decide('rejected')">Send back</button>
          <button type="button" class="btn btn--primary" :disabled="submitting" @click="decide('approved')">
            {{ submitting ? "Saving…" : "Approve" }}
          </button>
        </div>
        <p class="text-[11px] text-stone-400 text-center mt-4">This is a secure, single-use approval link.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.approve-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: #f5f5f4;
}
@media (prefers-color-scheme: dark) {
  .approve-page { background: #0c0a09; }
}
.approve-card {
  width: 100%;
  max-width: 26rem;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 1.25rem;
  box-shadow: 0 10px 40px -12px rgba(0, 0, 0, 0.18);
  padding: 1.75rem;
}
@media (prefers-color-scheme: dark) {
  .approve-card { background: #1c1917; border-color: rgba(255, 255, 255, 0.08); }
}
.icon-bubble {
  width: 3.25rem; height: 3.25rem; border-radius: 9999px;
  display: inline-flex; align-items: center; justify-content: center;
}
.icon-bubble--ok { background: #dcfce7; color: #15803d; }
.icon-bubble--warn { background: #ffedd5; color: #c2410c; }
.icon-bubble--muted { background: #f5f5f4; color: #a8a29e; }
.detail-box {
  background: #fafaf9; border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 0.875rem; padding: 1rem;
}
@media (prefers-color-scheme: dark) {
  .detail-box { background: #292524; border-color: rgba(255, 255, 255, 0.06); }
}
.field {
  width: 100%; padding: 0.625rem 0.875rem; font-size: 0.875rem;
  border: 1px solid rgba(0, 0, 0, 0.12); border-radius: 0.75rem;
  background: #fff; color: #1c1917;
}
@media (prefers-color-scheme: dark) {
  .field { background: #0c0a09; color: #e7e5e4; border-color: rgba(255, 255, 255, 0.12); }
}
.field:focus { outline: 2px solid #6366f1; outline-offset: 1px; }
.btn {
  flex: 1; padding: 0.625rem 1rem; font-size: 0.875rem; font-weight: 600;
  border-radius: 9999px; transition: opacity 0.15s, background 0.15s; cursor: pointer;
}
.btn:disabled { opacity: 0.55; cursor: default; }
.btn--primary { background: #4f46e5; color: #fff; }
.btn--primary:hover:not(:disabled) { background: #4338ca; }
.btn--ghost { background: transparent; color: #57534e; border: 1px solid rgba(0, 0, 0, 0.12); }
@media (prefers-color-scheme: dark) { .btn--ghost { color: #d6d3d1; border-color: rgba(255, 255, 255, 0.14); } }
</style>

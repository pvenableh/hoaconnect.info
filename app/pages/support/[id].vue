<script setup lang="ts">
// One platform request: the thread, and a reply box. The requester, their
// community's HOA Admins, and a billing account's admins see it here; HOA
// Connect works it in /ops/support.
import { toast } from "vue-sonner";
import { BODY_MAX, SUPPORT_CATEGORIES, SUPPORT_STATUS_LABEL } from "#core/shared/support/access";
import { shortDate } from "#core/shared/ops/format";

definePageMeta({ middleware: ["auth"], layout: "auth" });

const route = useRoute();
const id = computed(() => String(route.params.id));
const { data, error, refresh } = await useFetch<any>(() => `/api/support/requests/${id.value}`);
useHead({ title: () => data.value?.request?.subject ?? "Support request" });

const reply = ref("");
const busy = ref(false);
async function send() {
  if (!reply.value.trim()) return;
  busy.value = true;
  try {
    await $fetch(`/api/support/requests/${id.value}/messages`, { method: "POST", body: { body: reply.value.trim() } });
    reply.value = "";
    toast.success("Sent to HOA Connect.");
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || "That didn't send.");
  } finally {
    busy.value = false;
  }
}
const categoryLabel = (v: string) => SUPPORT_CATEGORIES.find((c) => c.value === v)?.label ?? v;
</script>

<template>
  <PageContainer class="max-w-2xl space-y-5">
    <NuxtLink to="/support" class="type-meta t-text-muted hover:underline">← Help &amp; support</NuxtLink>

    <AppEmptyState v-if="error" title="That request isn't here" description="It may belong to someone else, or the link is wrong." icon="lucide:life-buoy" />

    <template v-else-if="data">
      <div>
        <h1 class="text-2xl font-semibold t-text">{{ data.request.subject }}</h1>
        <p class="mt-0.5 type-meta t-text-muted">
          {{ categoryLabel(data.request.category) }} · {{ SUPPORT_STATUS_LABEL[data.request.status as keyof typeof SUPPORT_STATUS_LABEL] ?? data.request.status }}
          <template v-if="data.request.requester && !data.request.mine"> · from {{ data.request.requester }}</template>
        </p>
      </div>

      <ol class="space-y-3">
        <li
          v-for="m in data.messages"
          :key="m.id"
          :class="['ios-card p-4', m.fromHoaConnect ? 'bg-info/10' : '']"
        >
          <p class="type-micro t-text-muted">{{ m.author ?? "Someone" }} · {{ shortDate(m.at) }}</p>
          <p class="mt-1 whitespace-pre-wrap type-body t-text">{{ m.body }}</p>
        </li>
      </ol>

      <form class="ios-card space-y-3 p-4" @submit.prevent="send">
        <Label for="support-reply">{{ data.request.status === "closed" ? "Reply to reopen it" : "Reply" }}</Label>
        <Textarea id="support-reply" v-model="reply" rows="4" :maxlength="BODY_MAX" />
        <div class="flex justify-end">
          <Button type="submit" :disabled="busy || !reply.trim()">{{ busy ? "Sending…" : "Send" }}</Button>
        </div>
      </form>
    </template>
  </PageContainer>
</template>

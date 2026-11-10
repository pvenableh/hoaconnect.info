<script setup lang="ts">
// One platform request: the thread, and a reply box. The requester, their
// community's HOA Admins, and a billing account's admins see it here; HOA
// Connect works it in /ops/support.
import { toast } from "vue-sonner";
import { BODY_MAX, SUPPORT_CATEGORIES, SUPPORT_STATUS_LABEL } from "#core/shared/support/access";
import { shortDate } from "#core/shared/ops/format";
import type { SupportAttachment } from "#core/shared/support/attachments";

definePageMeta({ middleware: ["auth"], layout: "auth" });

const route = useRoute();
const id = computed(() => String(route.params.id));
const { data, error, refresh } = await useFetch<any>(() => `/api/support/requests/${id.value}`);
useHead({ title: () => data.value?.request?.subject ?? "Support request" });

const reply = ref("");
const files = ref<SupportAttachment[]>([]);
const uploading = ref(false);
const busy = ref(false);
const canSend = computed(() => !busy.value && !uploading.value && (!!reply.value.trim() || files.value.length > 0));
async function send() {
  if (!canSend.value) return;
  busy.value = true;
  try {
    await $fetch(`/api/support/requests/${id.value}/messages`, {
      method: "POST",
      body: { body: reply.value.trim(), attachmentIds: files.value.length ? files.value.map((f) => f.id) : undefined },
    });
    reply.value = "";
    files.value = [];
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
          <p v-if="m.body" class="mt-1 whitespace-pre-wrap type-body t-text">{{ m.body }}</p>
          <SupportAttachmentList :attachments="m.attachments" />
        </li>
      </ol>

      <form class="ios-card space-y-3 p-4" @submit.prevent="send">
        <Label for="support-reply">{{ data.request.status === "closed" ? "Reply to reopen it" : "Reply" }}</Label>
        <Textarea id="support-reply" v-model="reply" rows="4" :maxlength="BODY_MAX" />
        <div class="flex flex-wrap items-end justify-between gap-2">
          <SupportAttachmentPicker v-model="files" v-model:uploading="uploading" :disabled="busy" />
          <Button type="submit" :disabled="!canSend">{{ busy ? "Sending…" : uploading ? "Uploading…" : "Send" }}</Button>
        </div>
      </form>
    </template>
  </PageContainer>
</template>

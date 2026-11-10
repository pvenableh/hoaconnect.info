<script setup lang="ts">
// Operator console: one platform request. Reply (the requester gets it by bell
// and email), add an internal note (no one outside HOA Connect sees it), set the
// status and priority. The asker's roles are as they were when they asked.
import { toast } from "vue-sonner";
import { BODY_MAX, SUPPORT_CATEGORIES, SUPPORT_PRIORITIES, SUPPORT_STATUS_LABEL_STAFF } from "#core/shared/support/access";
import { shortDate } from "#core/shared/ops/format";
import type { SupportAttachment } from "#core/shared/support/attachments";

definePageMeta({ middleware: ["auth"], layout: "auth" });

const route = useRoute();
const id = computed(() => String(route.params.id));
const { data, error, refresh } = await useFetch<any>(() => `/api/ops/support/${id.value}`);
const r = computed(() => data.value?.request ?? null);
useHead({ title: () => `${r.value?.subject ?? "Request"} · Support` });

const body = ref("");
const internal = ref(false);
const files = ref<SupportAttachment[]>([]);
const uploading = ref(false);
const busy = ref(false);
const canSend = computed(() => !busy.value && !uploading.value && (!!body.value.trim() || files.value.length > 0));
async function send() {
  if (!canSend.value) return;
  busy.value = true;
  try {
    await $fetch(`/api/ops/support/${id.value}/messages`, {
      method: "POST",
      body: { body: body.value.trim(), internal: internal.value, attachmentIds: files.value.length ? files.value.map((f) => f.id) : undefined },
    });
    toast.success(internal.value ? "Note added." : "Reply sent.");
    body.value = "";
    files.value = [];
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || "That didn't send.");
  } finally {
    busy.value = false;
  }
}
async function update(next: { status?: string; priority?: string }) {
  try {
    await $fetch(`/api/ops/support/${id.value}`, { method: "POST", body: next });
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || "That didn't save.");
  }
}
const categoryLabel = (v: string) => SUPPORT_CATEGORIES.find((c) => c.value === v)?.label ?? v;
const statusItems = Object.entries(SUPPORT_STATUS_LABEL_STAFF).map(([value, label]) => ({ value, label }));
</script>

<template>
  <OpsShell :title="r?.subject ?? 'Request'" :description="r ? categoryLabel(r.category) : undefined" back-to="/ops/support" back-label="Support">
    <div v-if="error" class="py-10">
      <AppEmptyState title="No such request" :description="error.statusMessage || error.message" icon="lucide:inbox" />
    </div>

    <div v-else-if="r" class="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div class="space-y-3 lg:col-span-2">
        <ol class="space-y-3">
          <li v-for="m in data.messages" :key="m.id" :class="['ios-card p-4', m.internal ? 'bg-warning/10' : m.kind === 'staff' ? 'bg-info/10' : '']">
            <p class="type-micro t-text-muted">
              {{ m.author ?? "Someone" }} · {{ shortDate(m.at) }}<template v-if="m.internal"> · internal note</template>
            </p>
            <p v-if="m.body" class="mt-1 whitespace-pre-wrap type-body t-text">{{ m.body }}</p>
            <SupportAttachmentList :attachments="m.attachments" />
          </li>
        </ol>

        <form class="ios-card space-y-3 p-4" @submit.prevent="send">
          <Textarea v-model="body" rows="5" :maxlength="BODY_MAX" :placeholder="internal ? 'A note for HOA Connect only.' : 'Your reply. It goes to them by email too.'" />
          <SupportAttachmentPicker v-model="files" v-model:uploading="uploading" :disabled="busy" />
          <div class="flex flex-wrap items-center justify-between gap-2">
            <label class="flex items-center gap-2 type-meta t-text-secondary">
              <input v-model="internal" type="checkbox" />
              Internal note
            </label>
            <Button type="submit" :disabled="!canSend">{{ busy ? "Sending…" : uploading ? "Uploading…" : internal ? "Add note" : "Send reply" }}</Button>
          </div>
        </form>
      </div>

      <aside class="space-y-3">
        <section class="ios-card space-y-3 p-4">
          <div class="space-y-1.5">
            <p class="type-label t-text-muted">Status</p>
            <AppSegmentedControl :items="statusItems" :model-value="r.status" size="sm" label="Status" @update:model-value="(v: string) => update({ status: v })" />
          </div>
          <div class="space-y-1.5">
            <p class="type-label t-text-muted">Priority</p>
            <AppSegmentedControl
              :items="SUPPORT_PRIORITIES.map((p) => ({ value: p, label: p }))"
              :model-value="r.priority"
              size="sm"
              label="Priority"
              @update:model-value="(v: string) => update({ priority: v })"
            />
          </div>
        </section>

        <section class="ios-card p-4">
          <h2 class="type-card t-text">From</h2>
          <template v-if="r.requester">
            <p class="type-body t-text">{{ r.requester.name || "—" }}</p>
            <a v-if="r.requester.email" :href="`mailto:${r.requester.email}`" class="type-micro t-text-muted hover:underline">{{ r.requester.email }}</a>
            <p v-if="r.rolesLine" class="mt-1 type-micro t-text-secondary">{{ r.rolesLine }} (when they asked)</p>
          </template>
          <p v-else class="type-meta t-text-muted">HOA Connect raised this itself.</p>
          <dl class="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 type-micro">
            <template v-if="r.community">
              <dt class="t-text-muted">Community</dt>
              <dd><NuxtLink :to="`/ops/communities/${r.community.id}`" class="t-text hover:underline">{{ r.community.name }}</NuxtLink></dd>
            </template>
            <template v-if="r.page"><dt class="t-text-muted">Page</dt><dd class="truncate font-mono t-text">{{ r.page }}</dd></template>
            <template v-if="r.appVersion"><dt class="t-text-muted">App version</dt><dd class="truncate font-mono t-text">{{ r.appVersion }}</dd></template>
            <dt class="t-text-muted">Opened</dt><dd class="t-text">{{ shortDate(r.dateCreated) }}</dd>
          </dl>
        </section>
      </aside>
    </div>
  </OpsShell>
</template>

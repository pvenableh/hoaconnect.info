<script setup lang="ts">
// Contact HOA Connect: a new platform request. The context (a community, or an
// agency billing account) decides which categories this person may use; the
// server checks the same rules (core/shared/support/access.ts).
import { toast } from "vue-sonner";
import { BODY_MAX, SUBJECT_MAX, SUPPORT_CATEGORIES } from "#core/shared/support/access";

definePageMeta({ middleware: ["auth"], layout: "auth" });
useHead({ title: "Contact HOA Connect" });

const route = useRoute();
const config = useRuntimeConfig();
const { data: ctx } = await useFetch<any>("/api/support/context");

type Option = { key: string; label: string; organizationId?: string; billingAccountId?: string; categories: string[] };
const options = computed<Option[]>(() => [
  ...(ctx.value?.communities ?? [])
    .filter((c: any) => c.categories.length)
    .map((c: any) => ({ key: `org:${c.id}`, label: c.name, organizationId: c.id, categories: c.categories })),
  ...(ctx.value?.accounts ?? []).map((a: any) => ({ key: `acct:${a.id}`, label: `${a.name} (billing account)`, billingAccountId: a.id, categories: a.categories })),
]);
const contextKey = ref("");
watch(options, (o) => {
  if (!contextKey.value && o.length) contextKey.value = o[0]!.key;
}, { immediate: true });
const current = computed(() => options.value.find((o) => o.key === contextKey.value) ?? null);
const categories = computed(() => SUPPORT_CATEGORIES.filter((c) => current.value?.categories.includes(c.value)));
const category = ref("");
watch(categories, (c) => {
  if (!c.some((x) => x.value === category.value)) category.value = c[0]?.value ?? "";
}, { immediate: true });

const subject = ref("");
const body = ref("");
const busy = ref(false);
const from = typeof route.query.from === "string" ? route.query.from.slice(0, 500) : undefined;

async function send() {
  if (!current.value || !category.value) return;
  if (subject.value.trim().length < 3) return toast.error("Give it a short subject.");
  if (body.value.trim().length < 10) return toast.error("Say a little more, so we can help.");
  busy.value = true;
  try {
    const res = await $fetch<{ id: string }>("/api/support/requests", {
      method: "POST",
      body: {
        organizationId: current.value.organizationId,
        billingAccountId: current.value.billingAccountId,
        category: category.value,
        subject: subject.value.trim(),
        body: body.value.trim(),
        page: from,
        appVersion: String((config.public as any).buildId ?? "").slice(0, 64) || undefined,
      },
    });
    toast.success("Sent to HOA Connect. We'll reply here and by email.");
    await navigateTo(`/support/${res.id}`);
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || "That didn't send.");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <PageContainer class="max-w-2xl space-y-5">
    <div>
      <NuxtLink to="/support" class="type-meta t-text-muted hover:underline">← Help &amp; support</NuxtLink>
      <h1 class="mt-1 text-2xl font-semibold t-text">Contact HOA Connect</h1>
    </div>

    <AppEmptyState
      v-if="ctx && !options.length"
      title="You can't contact HOA Connect from here"
      description="Ask your community's HOA Admin, or ask your community from Help & support."
      icon="lucide:life-buoy"
    />

    <form v-else class="ios-card space-y-4 p-4" @submit.prevent="send">
      <div v-if="options.length > 1" class="space-y-1.5">
        <Label for="support-context">About</Label>
        <select id="support-context" v-model="contextKey" class="w-full rounded-lg border border-[var(--theme-border-primary)] bg-transparent px-3 py-2 type-body t-text">
          <option v-for="o in options" :key="o.key" :value="o.key">{{ o.label }}</option>
        </select>
      </div>

      <fieldset class="space-y-2">
        <legend class="type-label t-text-muted">What's it about?</legend>
        <label v-for="c in categories" :key="c.value" class="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:t-bg-subtle">
          <input v-model="category" type="radio" name="support-category" :value="c.value" class="mt-1" />
          <span>
            <span class="block type-body t-text">{{ c.label }}</span>
            <span class="block type-micro t-text-muted">{{ c.hint }}</span>
          </span>
        </label>
        <p v-if="categories.length === 1 && categories[0]?.value === 'bug'" class="type-micro t-text-muted">
          Questions about dues, rules or your home go to your community: use "Ask my community".
        </p>
      </fieldset>

      <div class="space-y-1.5">
        <Label for="support-subject">Subject</Label>
        <Input id="support-subject" v-model="subject" :maxlength="SUBJECT_MAX" />
      </div>
      <div class="space-y-1.5">
        <Label for="support-body">Message</Label>
        <Textarea id="support-body" v-model="body" rows="6" :maxlength="BODY_MAX" placeholder="What happened, and what you expected. Which page, if it's a problem." />
      </div>
      <div class="flex justify-end gap-2">
        <Button type="button" variant="ghost" as="a" href="/support">Cancel</Button>
        <Button type="submit" :disabled="busy || !category">{{ busy ? "Sending…" : "Send" }}</Button>
      </div>
    </form>
  </PageContainer>
</template>

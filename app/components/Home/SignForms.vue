<script setup lang="ts">
/**
 * HomeSignForms — "Needs you" rows for forms the community asked the person to
 * sign (docs/scope-notices-and-forms.md, step 4). The list is the server's
 * (`/api/org/forms/mine`, org- and hat-aware). "Sign" opens a sheet: read the
 * document, type your name, sign. The server records the time, IP and browser
 * (`POST /api/org/forms/sign`); the row leaves when it says ok. Renders nothing
 * when nothing is owed.
 */
import { toast } from "vue-sonner";
import { isFormOverdue, cleanSignedName } from "#core/shared/home/forms";

interface OwedForm {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  hasDocument: boolean;
}

const props = defineProps<{ organizationId: string | null | undefined }>();
const emit = defineEmits<{ done: [id: string] }>();

const { data } = await useAsyncData(
  () => `home-sign-forms-${props.organizationId}`,
  async () =>
    props.organizationId
      ? await $fetch<{ forms: OwedForm[] }>("/api/org/forms/mine", { query: { orgId: props.organizationId } }).catch(() => ({ forms: [] }))
      : { forms: [] },
  { watch: [() => props.organizationId], server: false, default: () => ({ forms: [] as OwedForm[] }) }
);
const gone = ref(new Set<string>());
const rows = computed(() => (data.value?.forms ?? []).filter((f) => !gone.value.has(f.id)));

const today = new Date().toISOString().slice(0, 10);
const dueLabel = (due: string | null) =>
  due ? `${isFormOverdue({ due_date: due }, today) ? "Was due" : "Due"} ${new Date(due).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : "No due date";

const sheetOpen = ref(false);
const active = ref<OwedForm | null>(null);
const typedName = ref("");
const agreed = ref(false);
const busy = ref(false);
const live = ref("");
const canSign = computed(() => agreed.value && !!cleanSignedName(typedName.value) && !busy.value);

// A reminder's button lands on /?sign=<id>: open that form's sheet once the list is in.
const route = useRoute();
const wanted = ref<string | null>(typeof route.query.sign === "string" ? route.query.sign : null);
watch(
  rows,
  (list) => {
    if (!wanted.value) return;
    const f = list.find((r) => r.id === wanted.value);
    if (f) {
      wanted.value = null;
      openSheet(f);
    }
  },
  { immediate: true }
);

function openSheet(f: OwedForm) {
  active.value = f;
  typedName.value = "";
  agreed.value = false;
  sheetOpen.value = true;
}

async function sign() {
  const form = active.value;
  if (!form || !canSign.value) return;
  busy.value = true;
  try {
    await $fetch("/api/org/forms/sign", { method: "POST", body: { orgId: props.organizationId, formId: form.id, signedName: typedName.value } });
    gone.value = new Set([...gone.value, form.id]);
    live.value = `Signed ${form.title}`;
    toast.success(live.value);
    sheetOpen.value = false;
    emit("done", form.id);
  } catch {
    toast.error("Could not record your signature. Try again.");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="rows.length" class="space-y-3" data-testid="home-sign-forms">
    <h2 class="t-eyebrow">Sign</h2>
    <AppCard class="overflow-hidden py-0">
      <ul class="divide-y">
        <li v-for="f in rows" :key="f.id" class="flex items-center gap-3 px-4 py-3" data-testid="home-sign-row">
          <Icon name="i-lucide-pen-line" class="h-4 w-4 shrink-0 t-text-muted" />
          <div class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium t-text">Sign: {{ f.title }}</span>
            <span class="block truncate text-sm" :class="isFormOverdue({ due_date: f.dueDate }, today) ? 'text-destructive' : 't-text-muted'">{{ dueLabel(f.dueDate) }}</span>
          </div>
          <AppButton size="sm" variant="outline" @click="openSheet(f)">Sign</AppButton>
        </li>
      </ul>
    </AppCard>
    <p class="sr-only" aria-live="polite">{{ live }}</p>

    <AppBottomSheet :open="sheetOpen" :title="active?.title ?? 'Sign form'" description="Read it, then type your name to sign." persistent @update:open="sheetOpen = $event">
      <form v-if="active" class="space-y-4 p-1" data-testid="home-sign-sheet" @submit.prevent="sign">
        <p v-if="active.description" class="text-sm t-text-muted">{{ active.description }}</p>
        <a
          v-if="active.hasDocument"
          :href="`/api/org/forms/${active.id}/document?orgId=${organizationId}`"
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
        >
          <Icon name="i-lucide-file-text" class="h-4 w-4" /> Read the document
        </a>
        <div class="space-y-1.5">
          <label for="sign-name" class="text-sm font-medium t-text">Type your full name</label>
          <AppInput id="sign-name" v-model="typedName" autocomplete="name" placeholder="Full name" data-testid="home-sign-name" />
        </div>
        <label class="flex items-start gap-2 text-sm t-text">
          <input v-model="agreed" type="checkbox" class="mt-1" data-testid="home-sign-agree" />
          <span>I have read this and agree. Typing my name is my signature.</span>
        </label>
        <p class="text-xs t-text-muted">We record the time, your IP address and your browser with your signature.</p>
        <div class="flex justify-end gap-2">
          <AppButton type="button" variant="ghost" @click="sheetOpen = false">Cancel</AppButton>
          <AppButton type="submit" :disabled="!canSign" data-testid="home-sign-submit">{{ busy ? "Signing…" : "Sign" }}</AppButton>
        </div>
      </form>
    </AppBottomSheet>
  </div>
</template>

<!--
  ResponsibilitiesJobForm — the one form for a standing job (plan §2.3: one form
  component per resource, in AppBottomSheet; edit opens the same form filled in).

  New: the job, and optionally its first holder. Edit: the facts only. Changing
  who holds it is Hand over, which keeps the history; Retire is its own action.
  The page mounts this only for someone who may edit; the route checks again.
-->
<script setup lang="ts">
import { BASES, CADENCES, CATEGORIES } from "#core/shared/responsibilities/config";
import { targetFromPick, type HolderPick } from "#core/shared/responsibilities/register-view";
import type { RegisterRow } from "#core/shared/responsibilities/views";

const props = defineProps<{
  open: boolean;
  orgId: string;
  /** The job being edited; null for a new one. */
  job: RegisterRow | null;
  /** Writes through the register's composable. */
  createJob: (body: Record<string, unknown>) => Promise<boolean>;
  patchJob: (id: string, body: Record<string, unknown>) => Promise<boolean>;
}>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();

const isOpen = computed({ get: () => props.open, set: (v) => emit("update:open", v) });
const editing = computed(() => !!props.job);

const blank = () => ({
  title: "",
  category: "finance" as string,
  cadence: "" as string,
  basis: "unknown" as string,
  basis_reference: "",
  description: "",
  notes: "",
  member_visible: true,
  status: "active" as string,
});
const form = reactive(blank());
const first = ref<HolderPick>({ kind: "none", value: "" });
const saving = ref(false);

// Fill the form each time the sheet opens, from the job or empty.
watch(
  () => [props.open, props.job?.id] as const,
  ([open]) => {
    if (!open) return;
    const j = props.job;
    Object.assign(
      form,
      j
        ? {
            title: j.title,
            category: String(j.category),
            cadence: j.cadence ?? "",
            basis: j.basis ?? "unknown",
            basis_reference: j.basis_reference ?? "",
            description: j.description ?? "",
            notes: j.notes ?? "",
            member_visible: j.member_visible !== false,
            status: j.status ?? "active",
          }
        : blank(),
    );
    first.value = { kind: "none", value: "" };
  },
  { immediate: true },
);

const canSave = computed(() => !saving.value && form.title.trim().length >= 2);

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  try {
    const common = {
      title: form.title.trim(),
      category: form.category,
      cadence: form.cadence || null,
      basis: form.basis,
      basis_reference: form.basis_reference.trim() || null,
      description: form.description.trim() || null,
      notes: form.notes.trim() || null,
      member_visible: form.member_visible,
    };
    let ok: boolean;
    if (props.job) {
      const j = props.job;
      const before: Record<string, unknown> = {
        title: j.title,
        category: String(j.category),
        cadence: j.cadence ?? null,
        basis: j.basis ?? "unknown",
        basis_reference: j.basis_reference ?? null,
        description: j.description ?? null,
        notes: j.notes ?? null,
        member_visible: j.member_visible !== false,
      };
      const patch = Object.fromEntries(Object.entries(common).filter(([k, v]) => v !== before[k]));
      // A retired job stays retired here; Retire is its own action, and the
      // route lets it come back to active only.
      if (form.status !== (j.status ?? "active") && form.status !== "retired") patch.status = form.status;
      if (!Object.keys(patch).length) {
        isOpen.value = false;
        return;
      }
      ok = await props.patchJob(j.id, patch);
    } else {
      const target = targetFromPick(first.value);
      ok = await props.createJob({ ...common, ...(target ? { holders: [{ ...target, role: "owner" }] } : {}) });
    }
    if (ok) isOpen.value = false;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppBottomSheet
    v-model:open="isOpen"
    :title="editing ? 'Edit job' : 'New job'"
    :description="
      editing
        ? 'The facts about this job. To change who holds it, hand it over: the history stays.'
        : 'A standing job: “reconciles the bank statements every month”, not “reconcile October”.'
    "
    size="md"
  >
    <div class="grid gap-4 py-4">
      <div class="grid gap-2">
        <Label for="job-title">Job</Label>
        <Input id="job-title" v-model="form.title" placeholder="Reconciles bank statements" maxlength="255" />
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="grid gap-2">
          <Label for="job-category">Section</Label>
          <select id="job-category" v-model="form.category" class="w-full p-2 border rounded">
            <option v-for="c in CATEGORIES" :key="c.key" :value="c.key">{{ c.label }}</option>
          </select>
        </div>
        <div class="grid gap-2">
          <Label for="job-cadence">How often</Label>
          <select id="job-cadence" v-model="form.cadence" class="w-full p-2 border rounded">
            <option value="">Not set</option>
            <option v-for="c in CADENCES" :key="c.key" :value="c.key">{{ c.label }}</option>
          </select>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="grid gap-2">
          <Label for="job-basis">What says so</Label>
          <select id="job-basis" v-model="form.basis" class="w-full p-2 border rounded">
            <option v-for="b in BASES" :key="b.key" :value="b.key">{{ b.label }}</option>
          </select>
        </div>
        <div class="grid gap-2">
          <Label for="job-basis-ref">Where</Label>
          <Input id="job-basis-ref" v-model="form.basis_reference" placeholder="Bylaws art. 7, or the contract" maxlength="255" />
        </div>
      </div>

      <div class="grid gap-2">
        <Label for="job-description">Description (optional)</Label>
        <AppTextarea id="job-description" v-model="form.description" rows="2" />
      </div>

      <div class="grid gap-2">
        <Label for="job-notes">Board notes (optional)</Label>
        <AppTextarea id="job-notes" v-model="form.notes" rows="2" placeholder="Never shown to owners" />
      </div>

      <label class="flex items-start justify-between gap-4">
        <span class="grid gap-0.5">
          <span class="text-sm font-medium t-text">Show to owners</span>
          <span class="text-xs t-text-muted">When the register is published. Off hides just this job.</span>
        </span>
        <Switch v-model="form.member_visible" />
      </label>

      <div v-if="editing" class="grid gap-2">
        <Label for="job-status">Status</Label>
        <select id="job-status" v-model="form.status" class="w-full p-2 border rounded">
          <option v-if="job?.status === 'retired'" value="retired">Retired</option>
          <option value="active">Active</option>
          <option value="disputed">Disputed</option>
        </select>
        <p class="text-xs t-text-muted">
          Disputed is for the board's eyes: owners see the holder, or nobody, and never the word.
        </p>
      </div>

      <ResponsibilitiesHolderPicker v-else v-model="first" :org-id="orgId" optional id-prefix="job-first" />
    </div>
    <template #footer>
      <Button variant="outline" @click="isOpen = false">Cancel</Button>
      <Button :disabled="!canSave" @click="save">{{ editing ? "Save job" : "Add job" }}</Button>
    </template>
  </AppBottomSheet>
</template>

<!--
  ResponsibilitiesHolderPicker — who holds a job: a board office, a member, a
  vendor, a team, or a name typed in (plan §3.4, "Who can hold a job"). One
  control for the three forms that name a holder (a new job, a hand-over, a
  second holder), so they cannot disagree about what a holder is.

  v-model is { kind, value }; `targetFromPick` turns it into the one column the
  routes take. With `optional`, "Nobody for now" is a kind too. The lists are read
  with the viewer's own token, so a manager who works the register without
  being an admin sees only the vendors residents see.
-->
<script setup lang="ts">
import { OFFICES } from "#core/shared/responsibilities/config";
import { PICK_KINDS, type HolderPick } from "#core/shared/responsibilities/register-view";

const props = defineProps<{
  orgId: string;
  modelValue: HolderPick;
  /** Offer "Nobody for now" as the first choice. */
  optional?: boolean;
  idPrefix?: string;
}>();
const emit = defineEmits<{ "update:modelValue": [value: HolderPick] }>();

const id = (s: string) => `${props.idPrefix ?? "holder"}-${s}`;

const { list: listMembers } = useDirectusItems("hoa_members");
const { list: listVendors } = useDirectusItems("hoa_vendors");
const { list: listTeams } = useDirectusItems("hoa_teams");

interface Option {
  id: string;
  name: string;
}
const members = ref<Option[]>([]);
const vendors = ref<Option[]>([]);
const teams = ref<Option[]>([]);

const nameOf = (r: any) => [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || "Member";

async function load() {
  if (!props.orgId) return;
  const where = { organization: { _eq: props.orgId } };
  const [m, v, t] = await Promise.all([
    listMembers({ fields: ["id", "first_name", "last_name", "email"], filter: { ...where, status: { _in: ["active", "inactive"] } }, sort: ["first_name", "last_name"], limit: 500 } as any).catch(() => []),
    listVendors({ fields: ["id", "company", "name"], filter: where, sort: ["company"], limit: 500 } as any).catch(() => []),
    listTeams({ fields: ["id", "name"], filter: where, sort: ["name"], limit: 200 } as any).catch(() => []),
  ]);
  members.value = ((m as any[]) || []).map((r) => ({ id: r.id, name: nameOf(r) }));
  vendors.value = ((v as any[]) || []).map((r) => ({ id: r.id, name: r.company || r.name || "Vendor" }));
  teams.value = ((t as any[]) || []).map((r) => ({ id: r.id, name: r.name || "Team" }));
}
onMounted(load);
watch(() => props.orgId, load);

const kind = computed({
  get: () => props.modelValue.kind,
  // A different kind starts empty: an office key is no member id.
  set: (k) => emit("update:modelValue", { kind: k, value: "" }),
});
const value = computed({
  get: () => props.modelValue.value,
  set: (v) => emit("update:modelValue", { kind: props.modelValue.kind, value: v }),
});

const choices = computed<Option[]>(() => {
  switch (props.modelValue.kind) {
    case "office":
      return OFFICES.map((o) => ({ id: o.key, name: o.label }));
    case "member":
      return members.value;
    case "vendor":
      return vendors.value;
    case "team":
      return teams.value;
    default:
      return [];
  }
});
const noun = computed(() => ({ office: "office", member: "member", vendor: "vendor", team: "team" })[props.modelValue.kind as string] ?? "");
</script>

<template>
  <div class="grid gap-3">
    <div class="grid gap-2">
      <Label :for="id('kind')">Held by</Label>
      <select :id="id('kind')" v-model="kind" class="w-full p-2 border rounded">
        <option v-if="optional" value="none">Nobody for now</option>
        <option v-for="k in PICK_KINDS" :key="k.key" :value="k.key">{{ k.label }}</option>
      </select>
    </div>

    <div v-if="modelValue.kind === 'label'" class="grid gap-2">
      <Label :for="id('label')">Name</Label>
      <Input :id="id('label')" v-model="value" placeholder="City of Miami Beach" maxlength="200" />
      <p class="text-xs t-text-muted">For someone who is not in the community: an agency, an authority, "Nobody".</p>
    </div>

    <div v-else-if="modelValue.kind !== 'none'" class="grid gap-2">
      <Label :for="id('value')" class="capitalize">{{ noun }}</Label>
      <select :id="id('value')" v-model="value" class="w-full p-2 border rounded">
        <option value="" disabled>Choose a {{ noun }}…</option>
        <option v-for="c in choices" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <p v-if="modelValue.kind === 'office'" class="text-xs t-text-muted">
        The person is read from the board for each date, so an election changes nothing here.
      </p>
      <p v-else-if="!choices.length" class="text-xs t-text-muted">No {{ noun }}s to choose from yet.</p>
    </div>
  </div>
</template>

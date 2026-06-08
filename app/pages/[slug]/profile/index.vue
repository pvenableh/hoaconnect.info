<script setup lang="ts">
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ChangeKind, ChangeAction } from "~/composables/useChangeRequests";

definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { selectedOrgId } = await useSelectedOrg();
const { fetchHousehold, submitChange } = useChangeRequests();

// Vehicles / pets are optional org modules — hide their sections when the admin
// has switched them off (Settings → Modules).
const { isEnabled } = useModules();
const vehiclesEnabled = computed(() => isEnabled("vehicles"));
const petsEnabled = computed(() => isEnabled("pets"));

const householdBlurb = computed(() => {
  const parts = ["contact details", "mailing address"];
  if (vehiclesEnabled.value) parts.push("vehicles");
  if (petsEnabled.value) parts.push("pets");
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
});

const { data, pending, refresh } = await useAsyncData(
  () => `my-household-${selectedOrgId.value}`,
  () => fetchHousehold(),
  { watch: [selectedOrgId], server: false }
);

// Pending-review lookups so each section can show "awaiting review".
const pendingKinds = computed(
  () => new Set((data.value?.pendingRequests || []).map((r) => r.kind))
);
const pendingTargetIds = computed(
  () => new Set((data.value?.pendingRequests || []).map((r) => r.target_id).filter(Boolean))
);

const fmtAddress = (a: any) =>
  a && (a.line1 || a.city)
    ? [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(", "), a.zip].filter(Boolean).join(" · ")
    : null;

const PET_TYPES = ["dog", "cat", "bird", "reptile", "other"];

// ── Single dialog driven by an `editor` descriptor ────────────────────────
interface Editor {
  kind: ChangeKind;
  action: ChangeAction;
  title: string;
  targetId?: string | null;
  fields: Record<string, any>;
}
const editor = ref<Editor | null>(null);
const note = ref("");
const saving = ref(false);

const openContact = () => {
  editor.value = { kind: "contact", action: "update", title: "Update contact info", fields: { phone: data.value?.member?.phone || "" } };
  note.value = "";
};
const openMailing = () => {
  const a = data.value?.member?.mailing_address || {};
  editor.value = {
    kind: "mailing_address",
    action: "update",
    title: "Update mailing address",
    fields: { line1: a.line1 || "", line2: a.line2 || "", city: a.city || "", state: a.state || "", zip: a.zip || "" },
  };
  note.value = "";
};
const openAddVehicle = () => {
  editor.value = { kind: "vehicle", action: "create", title: "Add a vehicle", fields: { make: "", model: "", year: "", license_plate: "", parking_spot: "" } };
  note.value = "";
};
const openAddPet = () => {
  editor.value = { kind: "pet", action: "create", title: "Add a pet", fields: { name: "", type: "dog", breed: "", weight: "" } };
  note.value = "";
};

const payloadFor = (e: Editor): Record<string, any> => {
  if (e.kind === "mailing_address") return { mailing_address: { ...e.fields } };
  return { ...e.fields };
};

const save = async () => {
  if (!editor.value) return;
  saving.value = true;
  try {
    await submitChange({
      kind: editor.value.kind,
      action: editor.value.action,
      targetId: editor.value.targetId,
      payload: payloadFor(editor.value),
      note: note.value || undefined,
    });
    editor.value = null;
    toast.success("Submitted for review", {
      description: "Your community manager will review this change shortly.",
    });
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || "Couldn't submit your change");
  } finally {
    saving.value = false;
  }
};

const requestRemoval = async (kind: ChangeKind, targetId: string, label: string) => {
  if (!confirm(`Request removal of ${label}? An admin will review it.`)) return;
  try {
    await submitChange({ kind, action: "delete", targetId });
    toast.success("Removal submitted for review");
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message || "Couldn't submit removal");
  }
};
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <header class="space-y-1">
        <h1 class="text-2xl font-semibold t-text">My household</h1>
        <p class="t-text-muted text-sm">
          Keep your {{ householdBlurb }} up to date.
          Changes are sent to your community manager for review.
        </p>
      </header>

      <div
        v-if="data?.pendingRequests?.length"
        class="rounded-xl border t-border bg-amber-500/10 px-4 py-3 text-sm flex items-center gap-2"
      >
        <Icon name="i-lucide-clock" class="size-4 text-amber-600 shrink-0" />
        You have {{ data.pendingRequests.length }} change{{ data.pendingRequests.length > 1 ? "s" : "" }} awaiting review.
      </div>

      <div v-if="pending" class="t-text-muted text-sm">Loading…</div>

      <template v-else>
        <!-- Contact -->
        <section class="rounded-xl border t-border t-bg-elevated p-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="font-medium flex items-center gap-2">
                Contact
                <span v-if="pendingKinds.has('contact')" class="text-[11px] uppercase tracking-wide text-amber-600">· pending review</span>
              </h2>
              <p class="t-text-muted text-sm mt-1">
                {{ data?.member?.email }}<span v-if="data?.member?.phone"> · {{ data.member.phone }}</span>
              </p>
            </div>
            <Button variant="outline" size="sm" @click="openContact">Edit</Button>
          </div>
        </section>

        <!-- Mailing address -->
        <section class="rounded-xl border t-border t-bg-elevated p-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="font-medium flex items-center gap-2">
                Mailing address
                <span v-if="pendingKinds.has('mailing_address')" class="text-[11px] uppercase tracking-wide text-amber-600">· pending review</span>
              </h2>
              <p class="t-text-muted text-sm mt-1">
                {{ fmtAddress(data?.member?.mailing_address) || "No separate mailing address on file." }}
              </p>
            </div>
            <Button variant="outline" size="sm" @click="openMailing">Edit</Button>
          </div>
        </section>

        <!-- Vehicles -->
        <section v-if="vehiclesEnabled" class="rounded-xl border t-border t-bg-elevated p-5">
          <div class="flex items-center justify-between gap-4 mb-3">
            <h2 class="font-medium">Vehicles</h2>
            <Button variant="outline" size="sm" @click="openAddVehicle">
              <Icon name="i-lucide-plus" class="size-4" /> Add vehicle
            </Button>
          </div>
          <ul v-if="data?.vehicles?.length" class="divide-y t-border">
            <li v-for="v in data.vehicles" :key="v.id" class="py-2.5 flex items-center justify-between gap-3">
              <div class="text-sm">
                <span class="font-medium">{{ [v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle" }}</span>
                <span class="t-text-muted"
                  ><template v-if="v.license_plate"> · {{ v.license_plate }}</template
                  ><template v-if="v.parking_spot"> · spot {{ v.parking_spot }}</template></span
                >
                <span v-if="pendingTargetIds.has(v.id)" class="text-[11px] uppercase tracking-wide text-amber-600"> · pending</span>
              </div>
              <Button variant="ghost" size="sm" @click="requestRemoval('vehicle', v.id, [v.make, v.model].filter(Boolean).join(' ') || 'this vehicle')">Remove</Button>
            </li>
          </ul>
          <p v-else class="t-text-muted text-sm">No vehicles on file.</p>
        </section>

        <!-- Pets -->
        <section v-if="petsEnabled" class="rounded-xl border t-border t-bg-elevated p-5">
          <div class="flex items-center justify-between gap-4 mb-3">
            <h2 class="font-medium">Pets</h2>
            <Button variant="outline" size="sm" @click="openAddPet">
              <Icon name="i-lucide-plus" class="size-4" /> Add pet
            </Button>
          </div>
          <ul v-if="data?.pets?.length" class="divide-y t-border">
            <li v-for="p in data.pets" :key="p.id" class="py-2.5 flex items-center justify-between gap-3">
              <div class="text-sm">
                <span class="font-medium">{{ p.name || "Pet" }}</span>
                <span class="t-text-muted"
                  ><template v-if="p.type"> · {{ p.type }}</template
                  ><template v-if="p.breed"> · {{ p.breed }}</template></span
                >
                <span v-if="pendingTargetIds.has(p.id)" class="text-[11px] uppercase tracking-wide text-amber-600"> · pending</span>
              </div>
              <Button variant="ghost" size="sm" @click="requestRemoval('pet', p.id, p.name || 'this pet')">Remove</Button>
            </li>
          </ul>
          <p v-else class="t-text-muted text-sm">No pets on file.</p>
        </section>
      </template>
    </PageContainer>

    <!-- Edit / add dialog -->
    <Dialog :open="!!editor" @update:open="(v) => { if (!v) editor = null; }">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ editor?.title }}</DialogTitle>
          <DialogDescription>This will be sent to your community manager for review.</DialogDescription>
        </DialogHeader>

        <div v-if="editor" class="space-y-3">
          <!-- Contact -->
          <template v-if="editor.kind === 'contact'">
            <div class="space-y-1.5">
              <Label>Phone</Label>
              <Input v-model="editor.fields.phone" type="tel" placeholder="(305) 555-0123" />
            </div>
          </template>

          <!-- Mailing -->
          <template v-else-if="editor.kind === 'mailing_address'">
            <div class="space-y-1.5"><Label>Address line 1</Label><Input v-model="editor.fields.line1" /></div>
            <div class="space-y-1.5"><Label>Address line 2</Label><Input v-model="editor.fields.line2" /></div>
            <div class="grid grid-cols-3 gap-2">
              <div class="space-y-1.5 col-span-2"><Label>City</Label><Input v-model="editor.fields.city" /></div>
              <div class="space-y-1.5"><Label>State</Label><Input v-model="editor.fields.state" /></div>
            </div>
            <div class="space-y-1.5"><Label>ZIP</Label><Input v-model="editor.fields.zip" /></div>
          </template>

          <!-- Vehicle -->
          <template v-else-if="editor.kind === 'vehicle'">
            <div class="grid grid-cols-3 gap-2">
              <div class="space-y-1.5"><Label>Year</Label><Input v-model="editor.fields.year" /></div>
              <div class="space-y-1.5"><Label>Make</Label><Input v-model="editor.fields.make" /></div>
              <div class="space-y-1.5"><Label>Model</Label><Input v-model="editor.fields.model" /></div>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div class="space-y-1.5"><Label>License plate</Label><Input v-model="editor.fields.license_plate" /></div>
              <div class="space-y-1.5"><Label>Parking spot</Label><Input v-model="editor.fields.parking_spot" /></div>
            </div>
          </template>

          <!-- Pet -->
          <template v-else-if="editor.kind === 'pet'">
            <div class="space-y-1.5"><Label>Name</Label><Input v-model="editor.fields.name" /></div>
            <div class="grid grid-cols-2 gap-2">
              <div class="space-y-1.5">
                <Label>Type</Label>
                <select v-model="editor.fields.type" class="w-full h-9 rounded-md border t-border bg-transparent px-2 text-sm capitalize">
                  <option v-for="t in PET_TYPES" :key="t" :value="t" class="capitalize">{{ t }}</option>
                </select>
              </div>
              <div class="space-y-1.5"><Label>Breed</Label><Input v-model="editor.fields.breed" /></div>
            </div>
            <div class="space-y-1.5"><Label>Weight</Label><Input v-model="editor.fields.weight" placeholder="e.g. 30 lbs" /></div>
          </template>

          <div class="space-y-1.5">
            <Label>Note for the reviewer <span class="t-text-muted">(optional)</span></Label>
            <Textarea v-model="note" rows="2" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" @click="editor = null">Cancel</Button>
          <Button :disabled="saving" @click="save">{{ saving ? "Submitting…" : "Submit for review" }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

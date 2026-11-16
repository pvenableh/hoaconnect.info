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
import type { ChangeKind, ChangeAction, HouseholdLease } from "#core/app/composables/useChangeRequests";
import { LEASE_DOCUMENT_MAX_BYTES, leaseDay, leaseRequestLine } from "#core/shared/units/lease-requests";

const { confirm } = useConfirm();

definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { selectedOrgId, currentOrg } = await useSelectedOrg();
const { fetchHousehold, submitChange, uploadLeaseDocument, requestDocumentUrl } = useChangeRequests();
const { getAuthUrl } = useDirectusFiles();

// Vehicles / pets are optional org modules — hide their sections when the admin
// has switched them off (Settings → Modules).
const { isEnabled } = useModules();
const vehiclesEnabled = computed(() => isEnabled("vehicles"));
const petsEnabled = computed(() => isEnabled("pets"));
const leasesEnabled = computed(() => isEnabled("leases"));

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
// A new pet or vehicle goes on one of the resident's units. With one unit the
// server picks it; with several the dialog asks, starting from the primary.
const myUnits = computed(() => data.value?.units || []);
const unitField = () => (myUnits.value.length > 1 ? { unit_id: myUnits.value[0]!.id } : {});
const openAddVehicle = () => {
  editor.value = {
    kind: "vehicle",
    action: "create",
    title: "Add a vehicle",
    fields: { make: "", model: "", year: "", license_plate: "", parking_spot: "", ...unitField() },
  };
  note.value = "";
};
const openAddPet = () => {
  editor.value = { kind: "pet", action: "create", title: "Add a pet", fields: { name: "", type: "dog", breed: "", weight: "", ...unitField() } };
  note.value = "";
};

// ── Leases: an owner reports that a unit is rented ───────────────────────
// One approval records the lease on the unit and invites the tenant. Owners
// see the section; a tenant sees it only for the lease they are on.
const ownedUnits = computed(() => data.value?.ownedUnits || []);
const leases = computed<HouseholdLease[]>(() => data.value?.leases || []);
const pendingLeases = computed(() => (data.value?.pendingRequests || []).filter((r) => r.kind === "lease"));
const showLeases = computed(() => leasesEnabled.value && (ownedUnits.value.length > 0 || leases.value.length > 0));
const personName = (p?: { first_name?: string | null; last_name?: string | null } | null) =>
  [p?.first_name, p?.last_name].filter(Boolean).join(" ");
const leaseTenant = (l: HouseholdLease) =>
  l.tenant?.id === data.value?.memberId ? "You" : personName(l.tenant) || (l.invited_tenant ? `${personName(l.invited_tenant)} (invited)` : "Tenant");

const openLease = () => {
  editor.value = {
    kind: "lease",
    action: "create",
    title: "Report a lease",
    fields: {
      ...(ownedUnits.value.length > 1 ? { unit_id: ownedUnits.value[0]!.id } : {}),
      tenant_first_name: "",
      tenant_last_name: "",
      tenant_email: "",
      start_date: "",
      end_date: "",
      document: null,
      document_name: "",
    },
  };
  note.value = "";
};

const uploading = ref(false);
const leaseFileInput = ref<HTMLInputElement | null>(null);
const onLeaseFile = async (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !editor.value) return;
  if (file.type !== "application/pdf") {
    toast.error("The signed lease has to be a PDF.");
    return;
  }
  if (file.size > LEASE_DOCUMENT_MAX_BYTES) {
    toast.error("That PDF is over 4 MB. Save a smaller copy and try again.");
    return;
  }
  uploading.value = true;
  try {
    const res = await uploadLeaseDocument(file);
    editor.value.fields.document = res.id;
    editor.value.fields.document_name = res.filename;
  } catch (err: any) {
    toast.error(err?.data?.message || "Couldn't upload the lease");
  } finally {
    uploading.value = false;
  }
};

const canSave = computed(() => {
  const e = editor.value;
  if (!e || saving.value || uploading.value) return false;
  if (e.kind !== "lease") return true;
  const f = e.fields;
  return !!(f.tenant_first_name?.trim() && f.tenant_last_name?.trim() && f.tenant_email?.trim() && f.start_date && f.end_date && f.document);
});

const payloadFor = (e: Editor): Record<string, any> => {
  if (e.kind === "mailing_address") return { mailing_address: { ...e.fields } };
  if (e.kind === "lease") {
    const rest = { ...e.fields };
    delete rest.document_name;
    return rest;
  }
  return { ...e.fields };
};

const save = async () => {
  if (!editor.value) return;
  saving.value = true;
  const isLease = editor.value.kind === "lease";
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
      description: isLease
        ? "Once it's approved, the lease is on your unit and your tenant gets an invitation."
        : "Your community manager will review this change shortly.",
    });
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || "Couldn't submit your change");
  } finally {
    saving.value = false;
  }
};

const requestRemoval = async (kind: ChangeKind, targetId: string, label: string) => {
  if (!(await confirm({ title: `Request removal of ${label}?`, body: "An admin will review it.", confirmLabel: "Request Removal", destructive: true }))) return;
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
        class="rounded-xl border border-warning/30 bg-warning/10 t-text px-4 py-3 text-sm flex items-center gap-2"
      >
        <Icon name="i-lucide-clock" class="size-4 text-warning shrink-0" />
        You have {{ data.pendingRequests.length }} change{{ data.pendingRequests.length > 1 ? "s" : "" }} awaiting review.
      </div>

      <div v-if="pending" class="t-text-muted text-sm">Loading…</div>

      <template v-else>
        <!-- Contact -->
        <section class="ios-card rounded-xl t-bg-elevated p-5">
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
        <section class="ios-card rounded-xl t-bg-elevated p-5">
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
        <section v-if="vehiclesEnabled" class="ios-card rounded-xl t-bg-elevated p-5">
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
        <section v-if="petsEnabled" class="ios-card rounded-xl t-bg-elevated p-5">
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

        <!-- Leases -->
        <section v-if="showLeases" class="ios-card rounded-xl t-bg-elevated p-5">
          <div class="flex items-center justify-between gap-4 mb-3">
            <h2 class="font-medium">Leases</h2>
            <Button v-if="ownedUnits.length" variant="outline" size="sm" @click="openLease">
              <Icon name="i-lucide-plus" class="size-4" /> Report a lease
            </Button>
          </div>
          <ul v-if="leases.length || pendingLeases.length" class="divide-y t-border">
            <li v-for="l in leases" :key="l.id" class="py-2.5 flex items-center justify-between gap-3">
              <div class="text-sm min-w-0">
                <span class="font-medium">Unit {{ l.unit?.unit_number || "—" }}</span>
                <span class="t-text-muted"> · {{ leaseTenant(l) }} · {{ leaseDay(l.start_date) }}<template v-if="l.end_date"> – {{ leaseDay(l.end_date) }}</template></span>
              </div>
              <a
                v-if="l.document"
                :href="getAuthUrl(l.document) || ''"
                target="_blank"
                rel="noopener"
                class="text-xs text-blue-600 hover:underline shrink-0 inline-flex items-center gap-1"
              >
                <Icon name="i-lucide-paperclip" class="size-3.5" /> Lease
              </a>
            </li>
            <li v-for="r in pendingLeases" :key="r.id" class="py-2.5 flex items-center justify-between gap-3">
              <div class="text-sm min-w-0">
                <span class="font-medium">{{ leaseRequestLine(r.payload) }}</span>
                <span class="type-micro text-amber-600"> · pending review</span>
              </div>
              <a
                :href="requestDocumentUrl(r.id)"
                target="_blank"
                rel="noopener"
                class="text-xs text-blue-600 hover:underline shrink-0 inline-flex items-center gap-1"
              >
                <Icon name="i-lucide-paperclip" class="size-3.5" /> Lease
              </a>
            </li>
          </ul>
          <p v-else class="t-text-muted text-sm">
            Renting out your unit? Report the lease here. Once it's approved, it's on your unit and your tenant is invited to join.
          </p>
        </section>
      </template>

      <!-- Email: community mail, bounces, what's always sent, notifications.
           The footer's "Preferences" link lands here (#email). -->
      <ProfileEmailPreferences :org-id="selectedOrgId" :org-name="currentOrg?.organization?.name" />
    </PageContainer>

    <!-- Edit / add dialog -->
    <Dialog :open="!!editor" @update:open="(v) => { if (!v) editor = null; }">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ editor?.title }}</DialogTitle>
          <DialogDescription>
            <template v-if="editor?.kind === 'lease'">Your community manager checks it, records it on your unit and invites your tenant.</template>
            <template v-else>This will be sent to your community manager for review.</template>
          </DialogDescription>
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
                <select v-model="editor.fields.type" class="w-full h-9 rounded-md px-2 text-sm capitalize">
                  <option v-for="t in PET_TYPES" :key="t" :value="t" class="capitalize">{{ t }}</option>
                </select>
              </div>
              <div class="space-y-1.5"><Label>Breed</Label><Input v-model="editor.fields.breed" /></div>
            </div>
            <div class="space-y-1.5"><Label>Weight</Label><Input v-model="editor.fields.weight" placeholder="e.g. 30 lbs" /></div>
          </template>

          <!-- Lease -->
          <template v-else-if="editor.kind === 'lease'">
            <div v-if="ownedUnits.length > 1" class="space-y-1.5">
              <Label>Unit</Label>
              <select v-model="editor.fields.unit_id" class="w-full h-9 rounded-md px-2 text-sm">
                <option v-for="u in ownedUnits" :key="u.id" :value="u.id">Unit {{ u.unit_number || "—" }}</option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div class="space-y-1.5"><Label>Tenant's first name</Label><Input v-model="editor.fields.tenant_first_name" autocomplete="off" /></div>
              <div class="space-y-1.5"><Label>Last name</Label><Input v-model="editor.fields.tenant_last_name" autocomplete="off" /></div>
            </div>
            <div class="space-y-1.5">
              <Label>Tenant's email</Label>
              <Input v-model="editor.fields.tenant_email" type="email" autocomplete="off" placeholder="We'll invite them to join" />
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div class="space-y-1.5"><Label>Starts</Label><DateInput v-model="editor.fields.start_date" /></div>
              <div class="space-y-1.5"><Label>Ends</Label><DateInput v-model="editor.fields.end_date" /></div>
            </div>
            <div class="space-y-1.5">
              <Label>Signed lease (PDF)</Label>
              <div class="flex items-center gap-2 min-w-0">
                <Button variant="outline" size="sm" class="shrink-0" :disabled="uploading" @click="leaseFileInput?.click()">
                  <Icon :name="uploading ? 'i-lucide-loader-2' : 'i-lucide-paperclip'" class="size-4" :class="{ 'animate-spin': uploading }" />
                  {{ editor.fields.document ? "Replace" : "Choose the PDF" }}
                </Button>
                <span class="text-sm t-text-muted truncate">{{ uploading ? "Uploading…" : editor.fields.document_name || "No file chosen" }}</span>
                <input ref="leaseFileInput" type="file" accept="application/pdf" class="hidden" @change="onLeaseFile" />
              </div>
            </div>
          </template>

          <div
            v-if="(editor.kind === 'vehicle' || editor.kind === 'pet') && editor.action === 'create' && myUnits.length > 1"
            class="space-y-1.5"
          >
            <Label>Unit</Label>
            <select v-model="editor.fields.unit_id" class="w-full h-9 rounded-md px-2 text-sm">
              <option v-for="u in myUnits" :key="u.id" :value="u.id">Unit {{ u.unit_number || "—" }}</option>
            </select>
          </div>

          <div class="space-y-1.5">
            <Label>Note for the reviewer <span class="t-text-muted">(optional)</span></Label>
            <Textarea v-model="note" rows="2" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" @click="editor = null">Cancel</Button>
          <Button :disabled="!canSave" @click="save">{{ saving ? "Submitting…" : "Submit for review" }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

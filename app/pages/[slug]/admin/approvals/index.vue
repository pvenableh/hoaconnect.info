<script setup lang="ts">
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";

// Light middleware so Property Managers (not just admins) can reach it; the
// server gates the data to reviewers (admin / PM-directory) and returns 403
// otherwise, which we surface as a clean "not authorized" state.
definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { selectedOrgId } = await useSelectedOrg();
const { listRequests, decide } = useChangeRequests();

const denied = ref(false);
const { data, pending, refresh } = await useAsyncData(
  () => `approvals-${selectedOrgId.value}`,
  async () => {
    try {
      return await listRequests("pending");
    } catch (e: any) {
      if (e?.statusCode === 403 || e?.response?.status === 403) denied.value = true;
      else throw e;
      return { scope: "pending", requests: [] };
    }
  },
  { watch: [selectedOrgId], server: false }
);

const requests = computed(() => data.value?.requests || []);

const memberName = (r: any) =>
  [r.member?.first_name, r.member?.last_name].filter(Boolean).join(" ") || "A resident";

const KIND_LABEL: Record<string, string> = {
  contact: "Contact info",
  mailing_address: "Mailing address",
  vehicle: "Vehicle",
  pet: "Pet",
};

const summarize = (r: any): string => {
  const p = r.payload || {};
  if (r.kind === "contact") return `Phone → ${p.phone || "—"}`;
  if (r.kind === "mailing_address") {
    const a = p.mailing_address || {};
    return [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(", "), a.zip].filter(Boolean).join(" · ") || "—";
  }
  if (r.kind === "vehicle") {
    if (r.action === "delete") return "Remove this vehicle";
    return `${[p.year, p.make, p.model].filter(Boolean).join(" ")}${p.license_plate ? " · " + p.license_plate : ""}${p.parking_spot ? " · spot " + p.parking_spot : ""}`;
  }
  if (r.kind === "pet") {
    if (r.action === "delete") return "Remove this pet";
    return `${p.name || ""}${p.type ? " (" + p.type + ")" : ""}${p.breed ? " · " + p.breed : ""}`;
  }
  return r.kind;
};

const actionVerb = (r: any) => (r.action === "create" ? "Add" : r.action === "delete" ? "Remove" : "Update");

const busy = ref<string | null>(null);

const approve = async (r: any) => {
  busy.value = r.id;
  try {
    await decide(r.id, "approve");
    toast.success("Approved");
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message || "Couldn't approve");
  } finally {
    busy.value = null;
  }
};

const reject = async (r: any) => {
  const note = prompt("Reason for rejecting (optional — shown to the resident):") ?? undefined;
  busy.value = r.id;
  try {
    await decide(r.id, "reject", note);
    toast.success("Rejected");
    await refresh();
  } catch (e: any) {
    toast.error(e?.data?.message || "Couldn't reject");
  } finally {
    busy.value = null;
  }
};
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <header class="space-y-1">
        <h1 class="text-2xl font-semibold">Approvals</h1>
        <p class="t-text-muted text-sm">Resident-submitted changes to contact info, mailing addresses, vehicles, and pets.</p>
      </header>

      <div v-if="denied" class="rounded-xl border t-border bg-red-500/10 px-4 py-3 text-sm">
        You don't have access to review changes for this organization.
      </div>

      <div v-else-if="pending" class="t-text-muted text-sm">Loading…</div>

      <div v-else-if="!requests.length" class="rounded-xl border t-border t-bg-elevated p-8 text-center">
        <Icon name="i-lucide-check-check" class="size-6 mx-auto t-text-muted mb-2" />
        <p class="t-text-muted text-sm">Nothing to review. You're all caught up.</p>
      </div>

      <ul v-else class="space-y-3">
        <li v-for="r in requests" :key="r.id" class="rounded-xl border t-border t-bg-elevated p-4">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="flex items-center gap-2 text-sm">
                <span class="font-medium">{{ memberName(r) }}</span>
                <span class="text-[11px] uppercase tracking-wide rounded-full px-2 py-0.5 t-bg-subtle t-text-muted">
                  {{ actionVerb(r) }} · {{ KIND_LABEL[r.kind] || r.kind }}
                </span>
              </div>
              <p class="mt-1.5 text-sm t-text">{{ summarize(r) }}</p>
              <p v-if="r.note" class="mt-1 text-xs t-text-muted italic">“{{ r.note }}”</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <Button variant="ghost" size="sm" :disabled="busy === r.id" @click="reject(r)">Reject</Button>
              <Button size="sm" :disabled="busy === r.id" @click="approve(r)">{{ busy === r.id ? "…" : "Approve" }}</Button>
            </div>
          </div>
        </li>
      </ul>
    </PageContainer>
  </div>
</template>

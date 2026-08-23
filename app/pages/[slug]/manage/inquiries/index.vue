<script setup lang="ts">
/**
 * Manager inquiries queue. Read-access comes from the Property Manager policy;
 * creating a violation is gated server-side (/api/hoa/requests/manager-create
 * checks the "violations" grant). Reuses the shared request list components.
 */
import { requestTypeList, getWorkflow, getStateMeta } from "#core/app/config/requestWorkflows";
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

definePageMeta({
  middleware: ["manager", "subscription"],
  layout: "auth",
  managerCapability: "inquiries",
});

const { buildOrgPath } = useOrgNavigation();
const { selectedOrgId } = await useSelectedOrg();
const { list } = useRequests();
const { managerCan } = useCurrentDomainAccess();
const membersApi = useDirectusItems("hoa_members");

const basePath = computed(() => buildOrgPath("/manage/inquiries"));
const typeFilter = ref<string>("all");
const statusFilter = ref<string>("open");

const { data: requests, pending, refresh } = await useAsyncData(
  `manage-inquiries-${selectedOrgId.value}`,
  () => list({}, ["-date_updated"]),
  { watch: [selectedOrgId], server: false }
);

const filtered = computed(() => {
  let rows = requests.value || [];
  if (typeFilter.value !== "all") rows = rows.filter((r) => r.type === typeFilter.value);
  if (statusFilter.value === "open") rows = rows.filter((r) => r.status !== "closed" && r.status !== "resolved");
  else if (statusFilter.value === "resolved") rows = rows.filter((r) => r.status === "resolved" || r.status === "closed");
  return rows;
});

// ── Violation creation (gated) ──
const canCreateViolation = computed(() => managerCan("violations"));
const showNew = ref(false);
const creating = ref(false);
const form = reactive({ title: "", description: "", priority: "normal", member: "" });
const members = ref<any[]>([]);

const openNew = async () => {
  showNew.value = true;
  if (!members.value.length && selectedOrgId.value) {
    try {
      members.value = await membersApi.list({
        filter: { organization: { _eq: selectedOrgId.value }, status: { _eq: "active" } },
        fields: ["id", "first_name", "last_name"],
        sort: ["first_name"],
        limit: -1,
      });
    } catch {
      /* member select stays empty */
    }
  }
};

const createViolation = async () => {
  if (!selectedOrgId.value) return;
  if (!form.title.trim()) {
    toast.error("Title is required");
    return;
  }
  creating.value = true;
  try {
    const wf = getWorkflow("violation");
    const status = getStateMeta("violation", wf.initialState).status;
    const { request } = await $fetch<{ request: { id: string } }>("/api/hoa/requests/manager-create", {
      method: "POST",
      body: {
        organization: selectedOrgId.value,
        type: "violation",
        title: form.title.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        member: form.member || null,
        status,
        metadata: { workflow_state: wf.initialState },
      },
    });
    toast.success("Violation created");
    showNew.value = false;
    form.title = "";
    form.description = "";
    form.priority = "normal";
    form.member = "";
    await refresh();
    navigateTo(`${basePath.value}/${request.id}`);
  } catch (e: any) {
    toast.error(e.data?.message || e.message || "Failed to create violation");
  } finally {
    creating.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <div class="flex items-center justify-between gap-2">
        <h1 class="text-2xl font-semibold t-text">Inquiries</h1>
        <Button v-if="canCreateViolation" class="rounded-full" @click="openNew">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" />New violation
        </Button>
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex gap-1.5 overflow-x-auto">
          <button
            v-for="opt in [{ key: 'all', label: 'All types' }, ...requestTypeList.map((t) => ({ key: t.type, label: t.label }))]"
            :key="opt.key"
            @click="typeFilter = opt.key"
            class="filter-pill flex-shrink-0"
            :class="{ 'filter-pill--active': typeFilter === opt.key }"
          >{{ opt.label }}</button>
        </div>
        <div class="flex gap-1.5 ml-auto">
          <button
            v-for="opt in [{ key: 'open', label: 'Open' }, { key: 'resolved', label: 'Resolved' }, { key: 'all', label: 'All' }]"
            :key="opt.key"
            @click="statusFilter = opt.key"
            class="filter-pill"
            :class="{ 'filter-pill--active': statusFilter === opt.key }"
          >{{ opt.label }}</button>
        </div>
      </div>

      <div class="ios-card p-2">
        <RequestsRequestList :requests="filtered" :base-path="basePath" :loading="pending" />
      </div>
    </PageContainer>

    <Dialog v-model:open="showNew">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New violation</DialogTitle>
          <DialogDescription>Record a violation for a member.</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="space-y-1.5">
            <Label>Title</Label>
            <Input v-model="form.title" placeholder="e.g. Unauthorized exterior modification" />
          </div>
          <div class="space-y-1.5">
            <Label>Member (optional)</Label>
            <select v-model="form.member" class="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm">
              <option value="">— none —</option>
              <option v-for="m in members" :key="m.id" :value="m.id">{{ (m.first_name || "") + " " + (m.last_name || "") }}</option>
            </select>
          </div>
          <div class="space-y-1.5">
            <Label>Priority</Label>
            <select v-model="form.priority" class="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm">
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div class="space-y-1.5">
            <Label>Description</Label>
            <textarea v-model="form.description" rows="4" class="flex w-full rounded-md border bg-transparent px-3 py-2 text-sm" placeholder="Details of the violation…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" class="rounded-full" @click="showNew = false">Cancel</Button>
          <Button class="rounded-full" :disabled="creating" @click="createViolation">
            {{ creating ? "Creating…" : "Create violation" }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

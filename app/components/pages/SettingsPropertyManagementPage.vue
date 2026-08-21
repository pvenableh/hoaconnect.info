<script setup lang="ts">
/**
 * Settings → Vendors & management.
 *
 *  - Vendors: the full directory of service providers (management, attorney,
 *    accountant, elevator, landscaping, …) with per-vendor member visibility,
 *    active-since/until history, and an archive view. Management-category vendors
 *    carry the inquiry-routing role + notify flags + an optional PM login link.
 *  - Managers: people with the Property Manager login role, with per-manager
 *    grant switches and the named presets from `shared/transition/grants.ts`.
 *    Invite new managers here — the preset chosen at invite time rides on the
 *    invitation and lands on the member row when they accept.
 *  - Transition: the guided manager swap (Phase 4). It lives on this page
 *    because this is where an admin already comes to see who manages the
 *    community and what they can do; a handover is the same subject, and
 *    burying it in a menu of its own is how it gets found only in a crisis.
 *  - Routing: inquiry type → management role + "always notify the board".
 */
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { requestTypeList } from "#core/app/config/requestWorkflows";
import { GRANT_PRESETS, matchPreset, presetFor } from "#core/shared/transition/grants";
import type { HoaVendor } from "#core/types/directus";

const config = useRuntimeConfig();
const { selectedOrgId, currentOrg } = await useSelectedOrg();
const orgId = computed(() => selectedOrgId.value);
const orgName = computed(() => currentOrg.value?.organization?.name || "");

const PM_ROLE = config.public.directusRolePropertyManager as string;

const vendorsApi = useDirectusItems<HoaVendor>("hoa_vendors");
const membersApi = useDirectusItems("hoa_members");
const orgApi = useDirectusItems("hoa_organizations");

// Linkable, replace-not-push — the shared tab contract.
const activeTab = useTabQuery({
  values: ["vendors", "managers", "transition", "routing"],
  fallback: "vendors",
});

const tabItems = [
  { value: "vendors", label: "Vendors", icon: "lucide:contact" },
  { value: "managers", label: "Managers", icon: "lucide:user-cog" },
  { value: "transition", label: "Transition", icon: "lucide:arrow-right-left" },
  { value: "routing", label: "Routing", icon: "lucide:route" },
];

const CATEGORY_OPTIONS = [
  { value: "management", label: "Management" },
  { value: "attorney", label: "Attorney" },
  { value: "accountant", label: "Accountant" },
  { value: "insurance", label: "Insurance" },
  { value: "elevator", label: "Elevator" },
  { value: "landscaping", label: "Landscaping" },
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "cleaning", label: "Cleaning / Janitorial" },
  { value: "security", label: "Security" },
  { value: "pest_control", label: "Pest Control" },
  { value: "hvac", label: "HVAC" },
  { value: "general_contractor", label: "General Contractor" },
  { value: "other", label: "Other" },
] as const;

const MANAGEMENT_ROLE_OPTIONS = [
  { value: "rental_sales", label: "Rental / Sales" },
  { value: "violations", label: "Violations / Management" },
  { value: "general", label: "General" },
] as const;

// One row per MANAGER_GRANT_KEYS entry — the phrasing is the screen's (a switch
// reads as an action), the keys are the module's. A test asserts this list stays
// in step with the key list, because a grant missing here is a permission an
// admin cannot turn on and, worse, cannot turn OFF when a manager leaves.
const GRANTS = [
  { key: "inquiries", label: "View & respond to inquiries", desc: "Read and respond to requests submitted to the community." },
  { key: "violations", label: "Manage violations", desc: "Create and manage violation notices." },
  { key: "directory", label: "View directory", desc: "See the member directory (names, units, contact)." },
  { key: "documents", label: "View documents", desc: "Access the community's documents." },
  { key: "communications", label: "Send communications", desc: "Send emails to members. Higher-trust." },
  { key: "feedback", label: "Community feedback", desc: "See polls and their results, and close a poll when the vote is done. Closing is recorded in the community's ledger." },
  { key: "projects", label: "Manage projects", desc: "Create and manage projects, milestones, and tasks." },
  { key: "activity", label: "View activity", desc: "See resident activity (page views, downloads) across the community." },
] as const;

const categoryLabel = (v: HoaVendor) =>
  v.category === "other"
    ? v.category_other || "Other"
    : CATEGORY_OPTIONS.find((o) => o.value === v.category)?.label || v.category;
const roleLabel = (k?: string | null) => MANAGEMENT_ROLE_OPTIONS.find((o) => o.value === k)?.label || k || "—";
const vendorTitle = (v: HoaVendor) => v.company || v.name || "Unnamed vendor";

// ─────────────────────────── Vendors ───────────────────────────
const vendors = ref<HoaVendor[]>([]);
const loadingVendors = ref(true);
const showArchived = ref(false);

const loadVendors = async () => {
  if (!orgId.value) return;
  loadingVendors.value = true;
  try {
    vendors.value = await vendorsApi.list({
      filter: { organization: { _eq: orgId.value } },
      sort: ["category", "sort", "company"],
      limit: -1,
    });
  } catch (e: any) {
    toast.error(e.message || "Failed to load vendors");
  } finally {
    loadingVendors.value = false;
  }
};

const visibleVendors = computed(() =>
  (vendors.value || []).filter((v) => (showArchived.value ? v.status === "archived" : v.status !== "archived"))
);

const blankVendor = () => ({
  id: undefined as string | undefined,
  category: "management" as HoaVendor["category"],
  category_other: "",
  company: "",
  name: "",
  email: "",
  phone: "",
  website: "",
  address: "",
  show_to_members: true,
  status: "active" as "active" | "inactive" | "archived",
  active_since: "",
  active_until: "",
  notes: "",
  management_role: "general" as "rental_sales" | "violations" | "general",
  notify_email: true,
  notify_inapp: true,
});
const editing = ref(blankVendor());
const dialogOpen = ref(false);
const savingVendor = ref(false);
const isManagement = computed(() => editing.value.category === "management");

const openNew = () => {
  editing.value = blankVendor();
  dialogOpen.value = true;
};
const openEdit = (v: HoaVendor) => {
  editing.value = {
    id: v.id,
    category: v.category,
    category_other: v.category_other || "",
    company: v.company || "",
    name: v.name || "",
    email: v.email || "",
    phone: v.phone || "",
    website: v.website || "",
    address: v.address || "",
    show_to_members: v.show_to_members !== false,
    status: (v.status as any) || "active",
    active_since: (v.active_since || "").slice(0, 10),
    active_until: (v.active_until || "").slice(0, 10),
    notes: v.notes || "",
    management_role: (v.management_role as any) || "general",
    notify_email: v.notify_email !== false,
    notify_inapp: v.notify_inapp !== false,
  };
  dialogOpen.value = true;
};

// Anchor the AI assistant to the vendor being viewed/edited while the dialog is
// open, so the assistant answers about THIS vendor (and keeps its own thread).
const { setContext: setAiFocus, clearContext: clearAiFocus } = useAiContext();
watch(dialogOpen, (open) => {
  const e = editing.value as any;
  if (open && e?.id) {
    setAiFocus({ entityType: "vendor", entityId: e.id, label: e.company || e.name || "Vendor" });
  } else {
    clearAiFocus();
  }
});

const saveVendor = async () => {
  if (!orgId.value) return;
  const e = editing.value;
  if (!e.company.trim() && !e.name.trim()) {
    toast.error("A company or contact name is required");
    return;
  }
  if (e.category === "other" && !e.category_other.trim()) {
    toast.error("Enter a label for the 'Other' category");
    return;
  }
  if (isManagement.value && e.notify_email && !e.email.trim()) {
    toast.error("An email is required when email notifications are on");
    return;
  }
  savingVendor.value = true;
  const payload: Record<string, any> = {
    category: e.category,
    category_other: e.category === "other" ? e.category_other.trim() || null : null,
    company: e.company.trim() || null,
    name: e.name.trim() || null,
    email: e.email.trim() || null,
    phone: e.phone.trim() || null,
    website: e.website.trim() || null,
    address: e.address.trim() || null,
    show_to_members: e.show_to_members,
    status: e.status,
    active_since: e.active_since || null,
    active_until: e.active_until || null,
    notes: e.notes.trim() || null,
    // Management-only fields (null them out for other categories)
    management_role: isManagement.value ? e.management_role : null,
    notify_email: isManagement.value ? e.notify_email : null,
    notify_inapp: isManagement.value ? e.notify_inapp : null,
  };
  try {
    if (e.id) await vendorsApi.update(e.id, payload as any);
    else await vendorsApi.create({ ...payload, organization: orgId.value } as any);
    toast.success("Vendor saved");
    dialogOpen.value = false;
    await loadVendors();
  } catch (err: any) {
    toast.error(err.message || "Failed to save vendor");
  } finally {
    savingVendor.value = false;
  }
};

const archiveVendor = async (v: HoaVendor) => {
  if (!v.id) return;
  const next = v.status === "archived" ? "active" : "archived";
  try {
    await vendorsApi.update(v.id, { status: next } as any);
    toast.success(next === "archived" ? "Vendor archived" : "Vendor restored");
    await loadVendors();
  } catch (e: any) {
    toast.error(e.message || "Failed to update vendor");
  }
};

const deleteVendor = async (v: HoaVendor) => {
  if (!v.id) return;
  if (!confirm(`Permanently delete ${vendorTitle(v)}? Use Archive to keep history instead.`)) return;
  try {
    await vendorsApi.remove(v.id);
    toast.success("Vendor deleted");
    await loadVendors();
  } catch (e: any) {
    toast.error(e.message || "Failed to delete vendor");
  }
};

// ─────────────────────────── Managers ───────────────────────────
interface ManagerRow {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  status?: string | null;
  manager_permissions?: Record<string, boolean> | null;
}
const managers = ref<ManagerRow[]>([]);
const loadingManagers = ref(true);
const savingGrants = ref<Record<string, boolean>>({});

const loadManagers = async () => {
  if (!orgId.value) return;
  loadingManagers.value = true;
  try {
    managers.value = await membersApi.list({
      filter: { organization: { _eq: orgId.value }, role: { _eq: PM_ROLE } },
      fields: ["id", "first_name", "last_name", "email", "status", "manager_permissions"],
      sort: ["first_name"],
      limit: -1,
    });
  } catch (e: any) {
    toast.error(e.message || "Failed to load managers");
  } finally {
    loadingManagers.value = false;
  }
};

const grantValue = (m: ManagerRow, key: string) => m.manager_permissions?.[key] === true;

/**
 * Both grant writes go through POST /api/org/managers/grants rather than a
 * direct Directus PATCH, because that route is where the change gets RECORDED.
 * A permission change with no date attached is exactly what a board asks about
 * two years later; see core/server/api/org/managers/grants.post.ts. The route
 * returns the resulting set, so the switch reflects what actually landed rather
 * than what we hoped would.
 */
const saveGrants = async (
  m: ManagerRow,
  payload: { key: string; value: boolean } | { presetKey: string }
) => {
  if (!orgId.value) return null;
  savingGrants.value[m.id] = true;
  try {
    const res = await $fetch<{
      manager_permissions: Record<string, boolean>;
      recorded: boolean;
      recordError: string | null;
      summary: string | null;
    }>("/api/org/managers/grants", {
      method: "POST",
      body: { orgId: orgId.value, memberId: m.id, ...payload },
    });
    m.manager_permissions = res.manager_permissions;
    // The permission itself is saved either way. Saying so is the honest
    // version of a green toast on a history with a hole in it.
    if (res.recordError) toast.warning(res.recordError);
    return res;
  } catch (e: any) {
    toast.error(e.data?.statusMessage || e.message || "Failed to update permission");
    return null;
  } finally {
    savingGrants.value[m.id] = false;
  }
};

const toggleGrant = async (m: ManagerRow, key: string, value: boolean) => {
  await saveGrants(m, { key, value });
};

/**
 * The preset a manager's current switches add up to, or null for a custom mix.
 * Shown as a badge so an admin reads "Full service" instead of counting seven
 * toggles — and so the word the sales page uses is the word the settings page
 * uses.
 */
const presetLabel = (m: ManagerRow) => matchPreset(m.manager_permissions)?.label ?? null;

/** Apply a whole preset in one write, which is also how it gets revoked cleanly. */
const applyPreset = async (m: ManagerRow, key: string) => {
  const preset = presetFor(key);
  if (!preset) return;
  const res = await saveGrants(m, { presetKey: key });
  if (res) toast.success(`${preset.label} applied`);
};

const inviteOpen = ref(false);
const invite = ref({ firstName: "", lastName: "", email: "", preset: "standard" });
const inviting = ref(false);
const sendInvite = async () => {
  if (!orgId.value) return;
  if (!invite.value.firstName.trim() || !invite.value.lastName.trim() || !invite.value.email.trim()) {
    toast.error("First name, last name and email are required");
    return;
  }
  inviting.value = true;
  try {
    await $fetch("/api/hoa/invite-member", {
      method: "POST",
      body: {
        email: invite.value.email.trim(),
        firstName: invite.value.firstName.trim(),
        lastName: invite.value.lastName.trim(),
        organizationId: orgId.value,
        roleId: PM_ROLE,
        // Parked on the invitation; copied onto the member row on acceptance.
        // Deciding this now, while thinking about who this person is, beats
        // deciding it days later from a row of switches.
        grantPreset: invite.value.preset,
      },
    });
    toast.success("Invitation sent");
    inviteOpen.value = false;
    invite.value = { firstName: "", lastName: "", email: "", preset: "standard" };
  } catch (e: any) {
    toast.error(e.data?.message || e.message || "Failed to send invitation");
  } finally {
    inviting.value = false;
  }
};

// ─────────────────────────── Routing ───────────────────────────
const ROUTING_OPTIONS = [...MANAGEMENT_ROLE_OPTIONS, { value: "none", label: "Don't notify a vendor" }] as const;
const routing = ref<{ board_default: boolean; map: Record<string, string> }>({ board_default: true, map: {} });
const loadingRouting = ref(true);
const savingRouting = ref(false);

const loadRouting = async () => {
  if (!orgId.value) return;
  loadingRouting.value = true;
  try {
    const org: any = await orgApi.get(orgId.value, { fields: ["inquiry_routing"] });
    const stored = org?.inquiry_routing || {};
    const map: Record<string, string> = { ...(stored.map || {}) };
    for (const t of requestTypeList) if (!(t.type in map)) map[t.type] = "general";
    routing.value = { board_default: stored.board_default !== false, map };
  } catch (e: any) {
    toast.error(e.message || "Failed to load routing");
  } finally {
    loadingRouting.value = false;
  }
};

const saveRouting = async () => {
  if (!orgId.value) return;
  savingRouting.value = true;
  try {
    await orgApi.update(orgId.value, { inquiry_routing: routing.value } as any);
    toast.success("Routing saved");
  } catch (e: any) {
    toast.error(e.message || "Failed to save routing");
  } finally {
    savingRouting.value = false;
  }
};

watch(orgId, () => {
  loadVendors();
  loadManagers();
  loadRouting();
}, { immediate: true });
</script>

<template>
  <div class="ui-kit accent-blue min-h-screen t-bg">
    <PageContainer>
      <div class="mb-8">
        <h1 class="text-3xl font-bold t-text">Vendors &amp; management</h1>
        <p class="t-text-muted mt-2">
          Keep your service providers in one place, control who members can see, and decide who's
          notified about inquiries.
        </p>
      </div>

      <AppSegmentedControl
        v-model="activeTab"
        :items="tabItems"
        label="Property management sections"
        class="mb-6"
      />

      <AppTabPanels :value="activeTab" :items="tabItems">

        <!-- ───────── Vendors ───────── -->
        <div v-if="activeTab === 'vendors'" class="space-y-6">
          <Card>
            <CardHeader class="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Vendor directory</CardTitle>
                <CardDescription>Attorney, accountant, management, elevator, landscaping, and more.</CardDescription>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <Button variant="outline" class="rounded-full" @click="showArchived = !showArchived">
                  <Icon :name="showArchived ? 'lucide:list' : 'lucide:archive'" class="h-4 w-4 mr-1.5" />
                  {{ showArchived ? "Active" : "Archive" }}
                </Button>
                <Button class="rounded-full" @click="openNew">
                  <Icon name="lucide:plus" class="h-4 w-4 mr-1.5" />Add vendor
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div v-if="loadingVendors" class="py-10 text-center t-text-muted">Loading…</div>
              <div v-else-if="!visibleVendors.length" class="py-10 text-center t-text-muted">
                {{ showArchived ? "No archived vendors." : "No vendors yet. Add your management company, attorney, etc." }}
              </div>
              <div v-else class="divide-y">
                <div v-for="v in visibleVendors" :key="v.id" class="flex items-center gap-3 py-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-medium t-text truncate">{{ vendorTitle(v) }}</span>
                      <span class="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 shrink-0">{{ categoryLabel(v) }}</span>
                      <span v-if="v.category === 'management' && v.management_role" class="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 shrink-0">{{ roleLabel(v.management_role) }}</span>
                      <span v-if="v.show_to_members === false" class="text-xs px-2 py-0.5 rounded-full bg-stone-200 text-stone-600 shrink-0">Hidden</span>
                      <span v-if="v.status === 'inactive'" class="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">Inactive</span>
                      <span v-if="v.status === 'archived'" class="text-xs px-2 py-0.5 rounded-full bg-stone-300 text-stone-700 shrink-0">Archived</span>
                    </div>
                    <div class="text-sm t-text-muted truncate">
                      <span v-if="v.company && v.name">{{ v.name }} · </span>{{ v.email || "no email" }}<span v-if="v.phone"> · {{ v.phone }}</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" class="rounded-full" @click="openEdit(v)" title="Edit">
                    <Icon name="lucide:pencil" class="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" class="rounded-full" @click="archiveVendor(v)" :title="v.status === 'archived' ? 'Restore' : 'Archive'">
                    <Icon :name="v.status === 'archived' ? 'lucide:archive-restore' : 'lucide:archive'" class="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" class="rounded-full text-rose-600" @click="deleteVendor(v)" title="Delete">
                    <Icon name="lucide:trash-2" class="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- ───────── Managers ───────── -->
        <div v-if="activeTab === 'managers'" class="space-y-6">
          <Card>
            <CardHeader class="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Property managers</CardTitle>
                <CardDescription>Management staff who can log in. Grant only the actions each manager needs.</CardDescription>
              </div>
              <Button class="rounded-full shrink-0" @click="inviteOpen = true">
                <Icon name="lucide:user-plus" class="h-4 w-4 mr-1.5" />Invite manager
              </Button>
            </CardHeader>
            <CardContent>
              <div v-if="loadingManagers" class="py-10 text-center t-text-muted">Loading…</div>
              <div v-else-if="!managers.length" class="py-10 text-center t-text-muted">
                No property managers yet. Invite one to grant scoped access.
              </div>
              <div v-else class="space-y-4">
                <div v-for="m in managers" :key="m.id" class="rounded-xl border p-4">
                  <div class="flex items-center justify-between gap-2 mb-3">
                    <div class="min-w-0">
                      <div class="font-medium t-text truncate flex items-center gap-2">
                        {{ (m.first_name || "") + " " + (m.last_name || "") }}
                        <span v-if="presetLabel(m)" class="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 shrink-0 font-normal">
                          {{ presetLabel(m) }}
                        </span>
                      </div>
                      <div class="text-sm t-text-muted truncate">{{ m.email }}</div>
                    </div>
                    <span v-if="m.status && m.status !== 'active'" class="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0 capitalize">{{ m.status }}</span>
                  </div>

                  <div class="flex items-center gap-2 flex-wrap mb-3">
                    <span class="text-xs t-text-muted mr-1">Set all at once:</span>
                    <Button
                      v-for="p in GRANT_PRESETS"
                      :key="p.key"
                      variant="outline"
                      size="sm"
                      class="rounded-full text-xs h-7"
                      :disabled="savingGrants[m.id]"
                      :title="p.description"
                      @click="applyPreset(m, p.key)"
                    >
                      {{ p.label }}
                    </Button>
                  </div>

                  <div class="divide-y">
                    <div v-for="g in GRANTS" :key="g.key" class="flex items-center justify-between gap-3 py-2.5">
                      <div class="space-y-0.5 pr-4">
                        <Label class="text-sm font-medium">{{ g.label }}</Label>
                        <p class="text-xs t-text-muted">{{ g.desc }}</p>
                      </div>
                      <Switch
                        :model-value="grantValue(m, g.key)"
                        :disabled="savingGrants[m.id]"
                        @update:model-value="(v) => toggleGrant(m, g.key, v)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <!-- ───────── Transition ───────── -->
        <div v-if="activeTab === 'transition'" class="space-y-6">
          <ManagementTransitionWizard
            v-if="orgId"
            :org-id="orgId"
            :org-name="orgName"
            @completed="loadManagers(); loadVendors();"
          />
        </div>

        <!-- ───────── Routing ───────── -->
        <div v-if="activeTab === 'routing'" class="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Inquiry routing</CardTitle>
              <CardDescription>Decide which management vendor is notified for each kind of inquiry.</CardDescription>
            </CardHeader>
            <CardContent>
              <div v-if="loadingRouting" class="py-10 text-center t-text-muted">Loading…</div>
              <template v-else>
                <div class="flex items-center justify-between gap-3 p-4 rounded-lg border bg-stone-50 mb-4">
                  <div class="space-y-0.5">
                    <Label class="text-base font-medium">Always notify the board</Label>
                    <p class="text-sm t-text-muted">The board is notified on every inquiry, in addition to the routed vendor.</p>
                  </div>
                  <Switch v-model="routing.board_default" />
                </div>

                <div class="divide-y">
                  <div v-for="t in requestTypeList" :key="t.type" class="flex items-center justify-between gap-3 py-3">
                    <Label class="text-sm font-medium">{{ t.label }}</Label>
                    <select v-model="routing.map[t.type]" class="flex h-9 rounded-md border bg-transparent px-3 text-sm">
                      <option v-for="o in ROUTING_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>
                </div>

                <p class="text-xs t-text-muted mt-3">Routes to active vendors in the <strong>Management</strong> category whose role matches.</p>

                <div class="flex justify-end pt-4">
                  <Button class="rounded-full" :disabled="savingRouting" @click="saveRouting">
                    {{ savingRouting ? "Saving…" : "Save routing" }}
                  </Button>
                </div>
              </template>
            </CardContent>
          </Card>
        </div>
      </AppTabPanels>
    </PageContainer>

    <!-- Vendor dialog -->
    <Dialog v-model:open="dialogOpen">
      <DialogContent class="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{{ editing.id ? "Edit vendor" : "Add vendor" }}</DialogTitle>
          <DialogDescription>A service provider for this community.</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label>Category</Label>
              <select v-model="editing.category" class="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm">
                <option v-for="o in CATEGORY_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </div>
            <div v-if="editing.category === 'other'" class="space-y-1.5">
              <Label>Custom category</Label>
              <Input v-model="editing.category_other" placeholder="e.g. Roofing" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label>Company / firm</Label>
              <Input v-model="editing.company" placeholder="Acme Property Mgmt" />
            </div>
            <div class="space-y-1.5">
              <Label>Contact person</Label>
              <Input v-model="editing.name" placeholder="Jane Smith" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label>Email</Label>
              <Input v-model="editing.email" type="email" placeholder="name@company.com" />
            </div>
            <div class="space-y-1.5">
              <Label>Phone</Label>
              <Input v-model="editing.phone" placeholder="(555) 123-4567" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label>Website</Label>
              <Input v-model="editing.website" placeholder="https://…" />
            </div>
            <div class="space-y-1.5">
              <Label>Address</Label>
              <Input v-model="editing.address" placeholder="123 Main St" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label>Active since</Label>
              <Input v-model="editing.active_since" type="date" />
            </div>
            <div class="space-y-1.5">
              <Label>Active until</Label>
              <Input v-model="editing.active_until" type="date" />
            </div>
          </div>

          <div class="space-y-1.5">
            <Label>Status</Label>
            <select v-model="editing.status" class="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived (historical)</option>
            </select>
          </div>

          <div class="flex items-center justify-between py-1">
            <div>
              <Label class="text-sm">Show to members</Label>
              <p class="text-xs t-text-muted">Appears in the member-facing vendor directory.</p>
            </div>
            <Switch v-model="editing.show_to_members" />
          </div>

          <!-- Management-only routing fields -->
          <div v-if="isManagement" class="rounded-lg border p-3 space-y-3 bg-blue-50/40">
            <p class="text-sm font-medium t-text">Management settings</p>
            <div class="space-y-1.5">
              <Label class="text-sm">Handles which inquiries</Label>
              <select v-model="editing.management_role" class="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm">
                <option v-for="o in MANAGEMENT_ROLE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </div>
            <div class="flex items-center justify-between">
              <Label class="text-sm">Notify by email on routed inquiries</Label>
              <Switch v-model="editing.notify_email" />
            </div>
            <div class="flex items-center justify-between">
              <Label class="text-sm">Notify in-app (if linked to a login)</Label>
              <Switch v-model="editing.notify_inapp" />
            </div>
          </div>

          <div class="space-y-1.5">
            <Label>Notes</Label>
            <textarea v-model="editing.notes" rows="3" class="flex w-full rounded-md border bg-transparent px-3 py-2 text-sm" placeholder="Contract terms, account number, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" class="rounded-full" @click="dialogOpen = false">Cancel</Button>
          <Button class="rounded-full" :disabled="savingVendor" @click="saveVendor">
            {{ savingVendor ? "Saving…" : "Save vendor" }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Invite dialog -->
    <Dialog v-model:open="inviteOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite property manager</DialogTitle>
          <DialogDescription>Pick what they can do now — it takes effect the moment they accept.</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label>First name</Label>
              <Input v-model="invite.firstName" />
            </div>
            <div class="space-y-1.5">
              <Label>Last name</Label>
              <Input v-model="invite.lastName" />
            </div>
          </div>
          <div class="space-y-1.5">
            <Label>Email</Label>
            <Input v-model="invite.email" type="email" placeholder="name@company.com" />
          </div>
          <div class="space-y-2">
            <Label>What should they be able to do?</Label>
            <div class="space-y-2">
              <button
                v-for="p in GRANT_PRESETS"
                :key="p.key"
                type="button"
                class="w-full flex items-start gap-3 rounded-xl border p-3 text-left"
                :class="invite.preset === p.key ? 'border-blue-500 bg-blue-50' : 't-border'"
                @click="invite.preset = p.key"
              >
                <span
                  class="h-4 w-4 mt-0.5 rounded-full border-2 shrink-0 grid place-items-center"
                  :class="invite.preset === p.key ? 'border-blue-600' : 't-border'"
                >
                  <span v-if="invite.preset === p.key" class="h-2 w-2 rounded-full bg-blue-600" />
                </span>
                <span class="min-w-0">
                  <span class="block text-sm font-medium t-text">{{ p.label }}</span>
                  <span class="block text-xs t-text-muted">{{ p.description }}</span>
                </span>
              </button>
            </div>
            <p class="text-xs t-text-muted">You can change any of this later, per manager.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" class="rounded-full" @click="inviteOpen = false">Cancel</Button>
          <Button class="rounded-full" :disabled="inviting" @click="sendInvite">
            {{ inviting ? "Sending…" : "Send invitation" }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

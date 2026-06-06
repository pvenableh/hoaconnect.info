<script setup lang="ts">
/**
 * Settings → Property management.
 *
 * Three tabs:
 *  - Contacts: the external management company's notification contacts
 *    (rental/sales, violations, general) — who gets pinged when an inquiry is
 *    routed to their kind.
 *  - Managers: people with the Property Manager login role in this org, with
 *    per-manager grant switches (inquiries / violations / directory / documents
 *    / communications). Invite new managers here.
 *  - Routing: inquiry type → contact kind map + "always notify the board".
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
import { requestTypeList } from "~/config/requestWorkflows";
import type { HoaManagementContact } from "~~/types/directus";

const config = useRuntimeConfig();
const { selectedOrgId } = await useSelectedOrg();
const orgId = computed(() => selectedOrgId.value);

const PM_ROLE = config.public.directusRolePropertyManager as string;

const contactsApi = useDirectusItems<HoaManagementContact>("hoa_management_contacts");
const membersApi = useDirectusItems("hoa_members");
const orgApi = useDirectusItems("hoa_organizations");

const activeTab = ref("contacts");

const KIND_OPTIONS = [
  { value: "rental_sales", label: "Rental / Sales" },
  { value: "violations", label: "Violations / Management" },
  { value: "general", label: "General" },
] as const;

const GRANTS = [
  { key: "inquiries", label: "View & respond to inquiries", desc: "Read and respond to requests submitted to the community." },
  { key: "violations", label: "Manage violations", desc: "Create and manage violation notices." },
  { key: "directory", label: "View directory", desc: "See the member directory (names, units, contact)." },
  { key: "documents", label: "View documents", desc: "Access the community's documents." },
  { key: "communications", label: "Send communications", desc: "Send emails to members. Higher-trust." },
] as const;

const kindLabel = (k: string) => KIND_OPTIONS.find((o) => o.value === k)?.label || k;

// ─────────────────────────── Contacts ───────────────────────────
const contacts = ref<HoaManagementContact[]>([]);
const loadingContacts = ref(true);

const loadContacts = async () => {
  if (!orgId.value) return;
  loadingContacts.value = true;
  try {
    contacts.value = await contactsApi.list({
      filter: { organization: { _eq: orgId.value } },
      sort: ["kind", "sort", "name"],
      limit: -1,
    });
  } catch (e: any) {
    toast.error(e.message || "Failed to load contacts");
  } finally {
    loadingContacts.value = false;
  }
};

const blankContact = () => ({
  id: undefined as string | undefined,
  name: "",
  company: "",
  kind: "general" as HoaManagementContact["kind"],
  email: "",
  phone: "",
  notify_email: true,
  notify_inapp: true,
  status: "active" as "active" | "inactive",
});
const editing = ref(blankContact());
const dialogOpen = ref(false);
const savingContact = ref(false);

const openNew = () => {
  editing.value = blankContact();
  dialogOpen.value = true;
};
const openEdit = (c: HoaManagementContact) => {
  editing.value = {
    id: c.id,
    name: c.name || "",
    company: c.company || "",
    kind: c.kind,
    email: c.email || "",
    phone: c.phone || "",
    notify_email: c.notify_email !== false,
    notify_inapp: c.notify_inapp !== false,
    status: (c.status as any) || "active",
  };
  dialogOpen.value = true;
};

const saveContact = async () => {
  if (!orgId.value) return;
  if (!editing.value.name.trim()) {
    toast.error("Name is required");
    return;
  }
  if (editing.value.notify_email && !editing.value.email.trim()) {
    toast.error("An email is required when email notifications are on");
    return;
  }
  savingContact.value = true;
  const payload = {
    name: editing.value.name.trim(),
    company: editing.value.company.trim() || null,
    kind: editing.value.kind,
    email: editing.value.email.trim() || null,
    phone: editing.value.phone.trim() || null,
    notify_email: editing.value.notify_email,
    notify_inapp: editing.value.notify_inapp,
    status: editing.value.status,
  };
  try {
    if (editing.value.id) {
      await contactsApi.update(editing.value.id, payload as any);
    } else {
      await contactsApi.create({ ...payload, organization: orgId.value } as any);
    }
    toast.success("Contact saved");
    dialogOpen.value = false;
    await loadContacts();
  } catch (e: any) {
    toast.error(e.message || "Failed to save contact");
  } finally {
    savingContact.value = false;
  }
};

const deleteContact = async (c: HoaManagementContact) => {
  if (!c.id) return;
  if (!confirm(`Remove ${c.name}?`)) return;
  try {
    await contactsApi.remove(c.id);
    toast.success("Contact removed");
    await loadContacts();
  } catch (e: any) {
    toast.error(e.message || "Failed to remove contact");
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

const toggleGrant = async (m: ManagerRow, key: string, value: boolean) => {
  savingGrants.value[m.id] = true;
  const next = { ...(m.manager_permissions || {}), [key]: value };
  try {
    await membersApi.update(m.id, { manager_permissions: next } as any);
    m.manager_permissions = next;
  } catch (e: any) {
    toast.error(e.message || "Failed to update permission");
  } finally {
    savingGrants.value[m.id] = false;
  }
};

// Invite a new property manager
const inviteOpen = ref(false);
const invite = ref({ firstName: "", lastName: "", email: "" });
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
      },
    });
    toast.success("Invitation sent");
    inviteOpen.value = false;
    invite.value = { firstName: "", lastName: "", email: "" };
  } catch (e: any) {
    toast.error(e.data?.message || e.message || "Failed to send invitation");
  } finally {
    inviting.value = false;
  }
};

// ─────────────────────────── Routing ───────────────────────────
const ROUTING_KIND_OPTIONS = [...KIND_OPTIONS, { value: "none", label: "Don't notify a contact" }] as const;
const routing = ref<{ board_default: boolean; map: Record<string, string> }>({
  board_default: true,
  map: {},
});
const loadingRouting = ref(true);
const savingRouting = ref(false);

const loadRouting = async () => {
  if (!orgId.value) return;
  loadingRouting.value = true;
  try {
    const org: any = await orgApi.get(orgId.value, { fields: ["inquiry_routing"] });
    const stored = org?.inquiry_routing || {};
    const map: Record<string, string> = { ...(stored.map || {}) };
    // Ensure every known type has an entry for the UI.
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
  loadContacts();
  loadManagers();
  loadRouting();
}, { immediate: true });
</script>

<template>
  <div class="ui-kit accent-blue min-h-screen t-bg">
    <PageContainer>
      <div class="mb-8">
        <h1 class="text-3xl font-bold t-text">Property management</h1>
        <p class="t-text-muted mt-2">
          Control who from your management company is notified about inquiries, and what each
          manager can do.
        </p>
      </div>

      <Tabs v-model="activeTab" default-value="contacts">
        <TabsList class="mb-6 flex-wrap h-auto gap-1">
          <TabsTrigger value="contacts"><Icon name="lucide:contact" class="h-4 w-4 mr-2" />Contacts</TabsTrigger>
          <TabsTrigger value="managers"><Icon name="lucide:user-cog" class="h-4 w-4 mr-2" />Managers</TabsTrigger>
          <TabsTrigger value="routing"><Icon name="lucide:route" class="h-4 w-4 mr-2" />Routing</TabsTrigger>
        </TabsList>

        <!-- ───────── Contacts ───────── -->
        <TabsContent value="contacts" class="space-y-6">
          <Card>
            <CardHeader class="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Management contacts</CardTitle>
                <CardDescription>People at your management company who get notified about inquiries.</CardDescription>
              </div>
              <Button class="rounded-full shrink-0" @click="openNew">
                <Icon name="lucide:plus" class="h-4 w-4 mr-1.5" />Add contact
              </Button>
            </CardHeader>
            <CardContent>
              <div v-if="loadingContacts" class="py-10 text-center t-text-muted">Loading…</div>
              <div v-else-if="!contacts.length" class="py-10 text-center t-text-muted">
                No contacts yet. Add your rental/sales and violations contacts.
              </div>
              <div v-else class="divide-y">
                <div v-for="c in contacts" :key="c.id" class="flex items-center gap-3 py-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="font-medium t-text truncate">{{ c.name }}</span>
                      <span class="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 shrink-0">{{ kindLabel(c.kind) }}</span>
                      <span v-if="c.status === 'inactive'" class="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">Inactive</span>
                    </div>
                    <div class="text-sm t-text-muted truncate">
                      <span v-if="c.company">{{ c.company }} · </span>{{ c.email || "no email" }}<span v-if="c.phone"> · {{ c.phone }}</span>
                    </div>
                    <div class="text-xs t-text-muted mt-0.5">
                      <span v-if="c.notify_email !== false">✉️ email</span>
                      <span v-if="c.notify_inapp !== false"> · 🔔 in-app</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" class="rounded-full" @click="openEdit(c)">
                    <Icon name="lucide:pencil" class="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" class="rounded-full text-rose-600" @click="deleteContact(c)">
                    <Icon name="lucide:trash-2" class="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <!-- ───────── Managers ───────── -->
        <TabsContent value="managers" class="space-y-6">
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
                      <div class="font-medium t-text truncate">{{ (m.first_name || "") + " " + (m.last_name || "") }}</div>
                      <div class="text-sm t-text-muted truncate">{{ m.email }}</div>
                    </div>
                    <span v-if="m.status && m.status !== 'active'" class="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0 capitalize">{{ m.status }}</span>
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
        </TabsContent>

        <!-- ───────── Routing ───────── -->
        <TabsContent value="routing" class="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Inquiry routing</CardTitle>
              <CardDescription>Decide which contact gets notified for each kind of inquiry.</CardDescription>
            </CardHeader>
            <CardContent>
              <div v-if="loadingRouting" class="py-10 text-center t-text-muted">Loading…</div>
              <template v-else>
                <div class="flex items-center justify-between gap-3 p-4 rounded-lg border bg-stone-50 mb-4">
                  <div class="space-y-0.5">
                    <Label class="text-base font-medium">Always notify the board</Label>
                    <p class="text-sm t-text-muted">The board is notified on every inquiry, in addition to the routed contact.</p>
                  </div>
                  <Switch v-model="routing.board_default" />
                </div>

                <div class="divide-y">
                  <div v-for="t in requestTypeList" :key="t.type" class="flex items-center justify-between gap-3 py-3">
                    <Label class="text-sm font-medium">{{ t.label }}</Label>
                    <select
                      v-model="routing.map[t.type]"
                      class="flex h-9 rounded-md border bg-transparent px-3 text-sm"
                    >
                      <option v-for="o in ROUTING_KIND_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                    </select>
                  </div>
                </div>

                <div class="flex justify-end pt-4">
                  <Button class="rounded-full" :disabled="savingRouting" @click="saveRouting">
                    {{ savingRouting ? "Saving…" : "Save routing" }}
                  </Button>
                </div>
              </template>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageContainer>

    <!-- Contact dialog -->
    <Dialog v-model:open="dialogOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ editing.id ? "Edit contact" : "Add contact" }}</DialogTitle>
          <DialogDescription>Management company contact for inquiry notifications.</DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label>Name</Label>
              <Input v-model="editing.name" placeholder="Jane Smith" />
            </div>
            <div class="space-y-1.5">
              <Label>Company</Label>
              <Input v-model="editing.company" placeholder="Acme Property Mgmt" />
            </div>
          </div>
          <div class="space-y-1.5">
            <Label>Handles</Label>
            <select v-model="editing.kind" class="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm">
              <option v-for="o in KIND_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
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
          <div class="flex items-center justify-between py-1">
            <Label class="text-sm">Notify by email</Label>
            <Switch v-model="editing.notify_email" />
          </div>
          <div class="flex items-center justify-between py-1">
            <Label class="text-sm">Notify in-app (if linked to a login)</Label>
            <Switch v-model="editing.notify_inapp" />
          </div>
          <div class="flex items-center justify-between py-1">
            <Label class="text-sm">Active</Label>
            <Switch :model-value="editing.status === 'active'" @update:model-value="(v) => editing.status = v ? 'active' : 'inactive'" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" class="rounded-full" @click="dialogOpen = false">Cancel</Button>
          <Button class="rounded-full" :disabled="savingContact" @click="saveContact">
            {{ savingContact ? "Saving…" : "Save contact" }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Invite dialog -->
    <Dialog v-model:open="inviteOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite property manager</DialogTitle>
          <DialogDescription>They'll get a login with no permissions until you grant them.</DialogDescription>
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

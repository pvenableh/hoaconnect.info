<script setup lang="ts">
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { HoaEmailTemplate } from "~~/types/directus";

const { navigateToOrg } = useOrgNavigation();
const emailTemplates = useEmailTemplates();
const { selectedOrgId } = await useSelectedOrg();
const orgId = computed(() => selectedOrgId.value);

const templates = ref<HoaEmailTemplate[]>([]);
const loading = ref(true);

const load = async () => {
  if (!orgId.value) return;
  loading.value = true;
  try {
    templates.value = await emailTemplates.listForOrg(orgId.value);
  } catch (e: any) {
    toast.error(e.message || "Failed to load templates");
  } finally {
    loading.value = false;
  }
};

watch(orgId, load, { immediate: true });

const typeBadge = (type?: string | null) => {
  const map: Record<string, string> = {
    basic: "t-bg-subtle t-text-secondary",
    alert: "bg-red-100 text-red-700",
    newsletter: "bg-sky-100 text-sky-700",
    announcement: "bg-orange-100 text-orange-700",
    reminder: "bg-amber-100 text-amber-700",
    notice: "bg-emerald-100 text-emerald-700",
  };
  return map[type || "basic"] || map.basic;
};

const isOwned = (tpl: HoaEmailTemplate) => emailTemplates.isOwnedBy(tpl, orgId.value || "");

// Delete
const toDelete = ref<HoaEmailTemplate | null>(null);
const deleting = ref(false);
const confirmDelete = (tpl: HoaEmailTemplate) => (toDelete.value = tpl);
const doDelete = async () => {
  if (!toDelete.value) return;
  deleting.value = true;
  try {
    await emailTemplates.remove(toDelete.value.id);
    templates.value = templates.value.filter((t) => t.id !== toDelete.value!.id);
    toast.success("Template deleted");
    toDelete.value = null;
  } catch (e: any) {
    toast.error(e.message || "Failed to delete template");
  } finally {
    deleting.value = false;
  }
};

useSeoMeta({ title: "Email Templates" });
</script>

<template>
  <div class="min-h-screen t-bg t-text">
    <PageContainer class="space-y-6">
      <CommunicationsTabs />
      <div class="flex items-start justify-between gap-2">
        <div>
          <Button variant="ghost" size="sm" class="mb-2 -ml-2" @click="navigateToOrg('/admin/communications')">
            <Icon name="lucide:arrow-left" class="w-4 h-4 mr-1.5" />
            Communications
          </Button>
          <h1 class="text-2xl font-semibold t-text">Email Templates</h1>
          <p class="text-sm t-text-muted mt-0.5">
            Reusable starting points for your emails. Save one from the composer with "Save as template".
          </p>
        </div>
        <Button class="rounded-full" @click="navigateToOrg('/admin/communications/compose')">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" />
          New email
        </Button>
      </div>

      <div v-if="loading" class="flex items-center justify-center py-16">
        <Icon name="lucide:loader-2" class="w-7 h-7 animate-spin t-text-muted" />
      </div>

      <div v-else-if="templates.length === 0" class="ios-card p-10 text-center">
        <Icon name="lucide:layout-template" class="w-10 h-10 mx-auto mb-3 t-text-muted opacity-50" />
        <p class="t-text-muted">No templates yet. Compose an email and choose "Save as template".</p>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="tpl in templates" :key="tpl.id" class="ios-card p-4 flex flex-col">
          <div class="flex items-center gap-2 mb-1">
            <span class="font-semibold t-text truncate">{{ tpl.name }}</span>
            <span class="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full" :class="typeBadge(tpl.email_type)">
              {{ tpl.email_type }}
            </span>
            <span v-if="!isOwned(tpl)" class="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700">
              Global
            </span>
          </div>
          <p v-if="tpl.description" class="text-sm t-text-muted line-clamp-2">{{ tpl.description }}</p>
          <p v-if="tpl.subject" class="text-xs t-text-muted mt-1 truncate">Subject: {{ tpl.subject }}</p>

          <div class="flex gap-2 mt-auto pt-3">
            <Button size="sm" variant="outline" class="rounded-full flex-1" @click="navigateToOrg('/admin/communications/compose')">
              <Icon name="lucide:pencil" class="w-3.5 h-3.5 mr-1.5" />
              Use
            </Button>
            <Button
              v-if="isOwned(tpl)"
              size="sm"
              variant="ghost"
              class="rounded-full w-9 h-9 p-0"
              @click="confirmDelete(tpl)"
            >
              <Icon name="lucide:trash-2" class="w-4 h-4 text-red-500" />
            </Button>
          </div>
        </div>
      </div>
    </PageContainer>

    <!-- Delete confirm -->
    <Dialog :open="!!toDelete" @update:open="(v) => { if (!v) toDelete = null }">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete template?</DialogTitle>
          <DialogDescription>
            "{{ toDelete?.name }}" will be permanently removed. Emails already sent are unaffected.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="toDelete = null">Cancel</Button>
          <Button variant="destructive" :disabled="deleting" @click="doDelete">
            <Icon v-if="deleting" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

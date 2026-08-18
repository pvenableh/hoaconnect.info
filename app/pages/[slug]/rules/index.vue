<script setup lang="ts">
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { GovernanceItem } from "#core/app/composables/useGovernance";

definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const { isAdmin } = await useSelectedOrg();
const canManage = computed(() => isAdmin.value);

const { listRules, search, getRule, createRule, updateRule, removeRule, GOVERNANCE_CATEGORIES } =
  useGovernance();

const query = ref("");
const debouncedQuery = refDebounced(query, 250);
const activeCategory = ref<string | null>(null);
const results = ref<GovernanceItem[]>([]);
const loading = ref(true);
const expandedId = ref<string | null>(null);
const detailCache = ref<Record<string, GovernanceItem>>({});

const runSearch = async () => {
  loading.value = true;
  try {
    const q = debouncedQuery.value.trim();
    const opts = { category: activeCategory.value, includeAllStatuses: canManage.value };
    results.value = (q ? await search(q, opts) : await listRules(opts)) as GovernanceItem[];
  } catch (e) {
    console.error("Rules search failed:", e);
    results.value = [];
  } finally {
    loading.value = false;
  }
};

watch([debouncedQuery, activeCategory], runSearch, { immediate: true });

// Group results by category (preserving the canonical category order).
const grouped = computed(() => {
  return GOVERNANCE_CATEGORIES.map((c) => ({
    ...c,
    items: results.value.filter((r) => r.category === c.value),
  })).filter((g) => g.items.length);
});

const categoryLabel = (value: string) =>
  GOVERNANCE_CATEGORIES.find((c) => c.value === value)?.label || value;

// ── Snippet + highlight ────────────────────────────────────────────────────────
const stripHtml = (html?: string | null) => (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const escapeReg = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const highlight = (text: string) => {
  const safe = escapeHtml(text);
  const q = debouncedQuery.value.trim();
  if (!q) return safe;
  return safe.replace(new RegExp(`(${escapeReg(escapeHtml(q))})`, "ig"), '<mark class="bg-yellow-200 rounded px-0.5">$1</mark>');
};

const snippet = (item: GovernanceItem) => {
  const base = item.summary?.trim() || stripHtml(item.content);
  return highlight(base.length > 220 ? `${base.slice(0, 220)}…` : base);
};

const toggle = async (item: GovernanceItem) => {
  if (expandedId.value === item.id) {
    expandedId.value = null;
    return;
  }
  expandedId.value = item.id;
  if (!detailCache.value[item.id]) {
    try {
      detailCache.value[item.id] = (await getRule(item.id)) as GovernanceItem;
    } catch (e) {
      console.error("Failed to load rule:", e);
    }
  }
};

// ── Admin create/edit ──────────────────────────────────────────────────────────
const showEditor = ref(false);
const saving = ref(false);
const blank = (): Partial<GovernanceItem> => ({
  title: "",
  category: "rule",
  status: "published",
  section_number: "",
  summary: "",
  content: "",
  effective_date: null,
  tags: [],
});
const form = ref<Partial<GovernanceItem>>(blank());
const tagsInput = ref("");

const openCreate = () => {
  form.value = blank();
  tagsInput.value = "";
  showEditor.value = true;
};
const openEdit = async (item: GovernanceItem) => {
  const full = detailCache.value[item.id] || ((await getRule(item.id)) as GovernanceItem);
  detailCache.value[item.id] = full;
  form.value = { ...full };
  tagsInput.value = (full.tags || []).join(", ");
  showEditor.value = true;
};

const effectiveDateInput = computed({
  get: () => (form.value.effective_date ? new Date(form.value.effective_date).toISOString().slice(0, 10) : ""),
  set: (v: string) => { form.value.effective_date = v ? new Date(v).toISOString() : null; },
});

const save = async () => {
  if (!form.value.title?.trim()) {
    toast.error("Title is required");
    return;
  }
  saving.value = true;
  try {
    const payload: Partial<GovernanceItem> = {
      ...form.value,
      title: form.value.title.trim(),
      tags: tagsInput.value.split(",").map((t) => t.trim()).filter(Boolean),
    };
    if (form.value.id) {
      await updateRule(form.value.id, payload);
      delete detailCache.value[form.value.id];
      toast.success("Rule updated");
    } else {
      await createRule(payload);
      toast.success("Rule published");
    }
    showEditor.value = false;
    await runSearch();
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || "Failed to save rule");
  } finally {
    saving.value = false;
  }
};

const onDelete = async (item: GovernanceItem) => {
  if (!confirm(`Delete “${item.title}”? This cannot be undone.`)) return;
  try {
    await removeRule(item.id);
    delete detailCache.value[item.id];
    toast.success("Rule deleted");
    await runSearch();
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || "Failed to delete rule");
  }
};

const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-5">
      <!-- Header -->
      <div class="flex items-center justify-between gap-2">
        <div>
          <h1 class="text-2xl font-semibold t-text">Rules & Governance</h1>
          <p class="text-sm t-text-muted mt-0.5">Search by-laws, CC&Rs, rules and policies.</p>
        </div>
        <Button v-if="canManage" class="rounded-full" @click="openCreate">
          <Icon name="lucide:plus" class="w-4 h-4 mr-1.5" /> New
        </Button>
      </div>

      <!-- Search -->
      <div class="relative">
        <Icon name="lucide:search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 t-text-muted" />
        <input
          v-model="query"
          type="search"
          placeholder="Search rules…"
          class="w-full pl-9 pr-3 py-2.5 rounded-full border t-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40"
        />
      </div>

      <!-- Category chips -->
      <div class="flex flex-wrap gap-2">
        <button
          class="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
          :class="activeCategory === null ? 'bg-violet-600 text-white border-violet-600' : 't-border t-text-secondary hover:t-bg-subtle'"
          @click="activeCategory = null"
        >
          All
        </button>
        <button
          v-for="c in GOVERNANCE_CATEGORIES"
          :key="c.value"
          class="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
          :class="activeCategory === c.value ? 'bg-violet-600 text-white border-violet-600' : 't-border t-text-secondary hover:t-bg-subtle'"
          @click="activeCategory = c.value"
        >
          {{ c.label }}
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="py-16 flex justify-center"><div class="spinner-ios" /></div>

      <!-- Empty -->
      <div v-else-if="!results.length" class="ios-card p-10 text-center">
        <Icon name="lucide:scale" class="w-8 h-8 mx-auto mb-3 t-text-muted" />
        <p class="t-text-secondary">{{ debouncedQuery ? "No rules match your search." : "No rules published yet." }}</p>
      </div>

      <!-- Grouped results -->
      <div v-else class="space-y-6">
        <section v-for="group in grouped" :key="group.value" class="space-y-2">
          <h2 class="text-xs font-semibold uppercase tracking-wide t-text-muted px-1">{{ group.label }}</h2>
          <div class="space-y-2">
            <div v-for="item in group.items" :key="item.id" class="ios-card overflow-hidden">
              <button class="w-full text-left px-4 py-3 flex items-start gap-3" @click="toggle(item)">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span v-if="item.section_number" class="text-xs font-mono t-text-muted">{{ item.section_number }}</span>
                    <h3 class="text-sm font-semibold t-text" v-html="highlight(item.title)" />
                    <span v-if="item.status !== 'published'" class="text-[10px] uppercase px-1.5 py-0.5 rounded t-bg-subtle t-text-muted">{{ item.status }}</span>
                  </div>
                  <p class="text-xs t-text-muted mt-1 line-clamp-2" v-html="snippet(item)" />
                </div>
                <Icon :name="expandedId === item.id ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="w-4 h-4 t-text-muted shrink-0 mt-0.5" />
              </button>

              <!-- Expanded detail -->
              <div v-if="expandedId === item.id" class="px-4 pb-4 border-t t-border">
                <div class="flex flex-wrap items-center gap-3 py-2 text-xs t-text-muted">
                  <span class="px-2 py-0.5 rounded-full t-bg-subtle">{{ categoryLabel(item.category) }}</span>
                  <span v-if="item.effective_date">Effective {{ fmtDate(item.effective_date) }}</span>
                  <span v-for="tag in (detailCache[item.id]?.tags || item.tags || [])" :key="tag" class="text-violet-600">#{{ tag }}</span>
                  <span v-if="canManage" class="ml-auto flex items-center gap-2">
                    <button class="hover:t-text inline-flex items-center gap-1" @click.stop="openEdit(item)">
                      <Icon name="lucide:pencil" class="w-3.5 h-3.5" /> Edit
                    </button>
                    <button class="hover:text-red-600 inline-flex items-center gap-1" @click.stop="onDelete(item)">
                      <Icon name="lucide:trash-2" class="w-3.5 h-3.5" /> Delete
                    </button>
                  </span>
                </div>
                <div v-if="!detailCache[item.id]" class="py-3 flex justify-center"><div class="spinner-ios" /></div>
                <div
                  v-else-if="detailCache[item.id]?.content"
                  class="tiptap-content text-sm t-text-secondary leading-relaxed"
                  v-html="detailCache[item.id]?.content"
                />
                <p v-else class="text-sm t-text-muted py-2">No additional text for this entry.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </PageContainer>

    <!-- Admin editor -->
    <Dialog v-model:open="showEditor">
      <DialogContent class="sm:max-w-[680px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{{ form.id ? "Edit rule" : "New rule" }}</DialogTitle>
        </DialogHeader>
        <div class="space-y-4">
          <div class="grid grid-cols-3 gap-3">
            <div class="col-span-2">
              <label class="block text-sm font-medium t-text-secondary mb-1.5">Title *</label>
              <Input v-model="form.title" placeholder="e.g. Pet policy" />
            </div>
            <div>
              <label class="block text-sm font-medium t-text-secondary mb-1.5">Section #</label>
              <Input v-model="form.section_number" placeholder="4.2.1" />
            </div>
            <div>
              <label class="block text-sm font-medium t-text-secondary mb-1.5">Category</label>
              <select v-model="form.category" class="w-full px-3 py-2 border rounded-md bg-background text-sm">
                <option v-for="c in GOVERNANCE_CATEGORIES" :key="c.value" :value="c.value">{{ c.label }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium t-text-secondary mb-1.5">Status</label>
              <select v-model="form.status" class="w-full px-3 py-2 border rounded-md bg-background text-sm">
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium t-text-secondary mb-1.5">Effective date</label>
              <Input v-model="effectiveDateInput" type="date" />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium t-text-secondary mb-1.5">Summary <span class="t-text-muted font-normal">(powers search snippets)</span></label>
            <textarea v-model="form.summary" rows="2" class="w-full px-3 py-2 border rounded-md bg-background text-sm resize-none" placeholder="Short plain-text blurb…" />
          </div>

          <div>
            <label class="block text-sm font-medium t-text-secondary mb-1.5">Content</label>
            <div class="border rounded-md t-border overflow-hidden">
              <TiptapEditor v-model="form.content" placeholder="Write the rule…" />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium t-text-secondary mb-1.5">Tags <span class="t-text-muted font-normal">(comma-separated)</span></label>
            <Input v-model="tagsInput" placeholder="pets, noise, parking" />
          </div>

          <div class="flex justify-end gap-2 pt-1">
            <Button variant="ghost" class="rounded-full" @click="showEditor = false">Cancel</Button>
            <Button class="rounded-full" :disabled="saving" @click="save">
              <Icon v-if="saving" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
              {{ form.id ? "Save" : "Publish" }}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.tiptap-content :deep(h1) { font-size: 1.25rem; font-weight: 700; margin: 0.75rem 0 0.5rem; }
.tiptap-content :deep(h2) { font-size: 1.1rem; font-weight: 600; margin: 0.75rem 0 0.5rem; }
.tiptap-content :deep(h3) { font-weight: 600; margin: 0.5rem 0; }
.tiptap-content :deep(p) { margin: 0.5rem 0; }
.tiptap-content :deep(ul) { list-style: disc; padding-left: 1.25rem; margin: 0.5rem 0; }
.tiptap-content :deep(ol) { list-style: decimal; padding-left: 1.25rem; margin: 0.5rem 0; }
.tiptap-content :deep(a) { color: var(--color-violet-600, #7c3aed); text-decoration: underline; }
.tiptap-content :deep(table) { border-collapse: collapse; margin: 0.5rem 0; }
.tiptap-content :deep(td), .tiptap-content :deep(th) { border: 1px solid var(--t-border, #e5e7eb); padding: 0.25rem 0.5rem; }
</style>

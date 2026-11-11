<script setup lang="ts">
// Governing documents: the review screen (Session 3B). One page of the
// original at a time: its image on one side, the draft provisions cut from it
// on the other. A manager checks each against the image, fixes the text and
// the boundaries, and marks it reviewed. Managers only; the server decides
// again on every call and writes the audit row.
//
// The text box holds the text as stored. Nothing here trims or tidies it: what
// is saved is what is in the box.
import { toast } from "vue-sonner";
import { kindLabel, statusLabel } from "#core/shared/governing/labels";
import {
  BLOCKING_MARKER,
  OCR_MARKERS,
  REVIEW_STATE_LABELS,
  asShownInTextBox,
  isDraftStatus,
  splitAtMarkers,
  storedOffset,
} from "#core/shared/governing/review";
import type { ReviewState } from "#core/shared/governing/types";
import type { GoverningReviewProvision } from "#core/app/composables/useGoverningDocs";

definePageMeta({
  middleware: ["auth", "subscription"],
  layout: "auth",
});

const route = useRoute();
const { buildOrgPath } = useOrgNavigation();
const { selectedOrgId } = await useSelectedOrg();
const { getAuthUrl } = useDirectusFiles();
const { confirm } = useConfirm();
const api = useGoverningDocs(selectedOrgId);

const documentId = computed(() => String(route.params.document ?? ""));

const { data, status, refresh } = await useAsyncData(
  () => `governing-review-${documentId.value}`,
  async () => {
    if (!selectedOrgId.value || !documentId.value) return null;
    try {
      return await api.getReview(documentId.value);
    } catch {
      // Not a manager, or no such document: the page says so.
      return null;
    }
  },
  { watch: [documentId, selectedOrgId], server: false }
);
const waiting = computed(() => status.value === "idle" || (status.value === "pending" && !data.value));

const doc = computed(() => data.value?.document ?? null);
const isDraft = computed(() => isDraftStatus(doc.value?.status));
const provisions = computed(() => data.value?.provisions ?? []);
const pages = computed(() => data.value?.pages ?? []);

// The groups the screen pages through: each page of each original, then the
// provisions that have no page (anything not made from an upload).
type Group = { key: string; label: string; image: string | null; pageText: string | null; provisions: GoverningReviewProvision[] };
const groups = computed<Group[]>(() => {
  const keyOf = (source: string, page: number) => `${source}:${page}`;
  const byPage = new Map<string, GoverningReviewProvision[]>();
  const loose: GoverningReviewProvision[] = [];
  for (const p of provisions.value) {
    const key = p.page ? keyOf(p.page.source, p.page.page_number) : null;
    if (key && pages.value.some((pg) => keyOf(pg.source, pg.page_number) === key)) byPage.set(key, [...(byPage.get(key) ?? []), p]);
    else loose.push(p);
  }
  const out: Group[] = pages.value.map((pg) => ({
    key: keyOf(pg.source, pg.page_number),
    label: `Page ${pg.page_number}`,
    image: pg.image,
    pageText: pg.text,
    provisions: byPage.get(keyOf(pg.source, pg.page_number)) ?? [],
  }));
  if (loose.length) out.push({ key: "none", label: "No page image", image: null, pageText: null, provisions: loose });
  return out;
});
const groupIndex = ref(0);
watch(groups, (g) => (groupIndex.value = Math.min(groupIndex.value, Math.max(0, g.length - 1))));
const group = computed(() => groups.value[groupIndex.value] ?? null);
const groupOpen = (g: Group) => g.provisions.filter((p) => p.review_state === "ocr_draft").length;

const reviewedCount = computed(() => provisions.value.filter((p) => p.review_state !== "ocr_draft").length);

// What the reviewer has typed and not saved, by provision id.
type Draft = { text: string; citation: string; heading: string; original_label: string };
const drafts = reactive<Record<string, Draft>>({});
const draftOf = (p: GoverningReviewProvision): Draft =>
  (drafts[p.id] ??= { text: asShownInTextBox(p.text), citation: p.citation ?? "", heading: p.heading ?? "", original_label: p.original_label ?? "" });
watch(provisions, (list) => {
  // Fresh from the server: drop what was typed for provisions that changed underneath or are gone.
  for (const id of Object.keys(drafts)) if (!list.some((p) => p.id === id)) delete drafts[id];
});
const textChanged = (p: GoverningReviewProvision) => draftOf(p).text !== asShownInTextBox(p.text);
const detailsChanged = (p: GoverningReviewProvision) => {
  const d = draftOf(p);
  return d.citation !== (p.citation ?? "") || d.heading !== (p.heading ?? "") || d.original_label !== (p.original_label ?? "");
};
const dirty = (p: GoverningReviewProvision) => textChanged(p) || detailsChanged(p);
const anyDirty = computed(() => provisions.value.some(dirty));

const reason = ref("");
const busy = ref<string | null>(null);
const message = (error: any, fallback: string) => error?.data?.message || error?.message || fallback;
// `settled` lists the provisions whose stored text this call changed: what was
// typed for them is dropped only once the new text has arrived, so the box can
// never be left holding the old text as an unsaved change.
const run = async (id: string, work: () => Promise<unknown>, done?: string, settled: string[] = []) => {
  if (busy.value) return;
  busy.value = id;
  try {
    await work();
    if (done) toast.success(done);
    await refresh();
    for (const key of settled) {
      delete drafts[key];
      delete cursors[key];
    }
  } catch (error) {
    toast.error(message(error, "That did not work."));
  } finally {
    busy.value = null;
  }
};

const save = (p: GoverningReviewProvision) =>
  run(
    p.id,
    async () => {
      const d = draftOf(p);
      await api.editProvision(
        p.id,
        {
          ...(textChanged(p) ? { text: d.text } : {}),
          ...(detailsChanged(p) ? { citation: d.citation, heading: d.heading, original_label: d.original_label } : {}),
        },
        reason.value || undefined
      );
    },
    "Saved",
    [p.id]
  );
const discard = (p: GoverningReviewProvision) => delete drafts[p.id];

const setState = (p: GoverningReviewProvision, state: ReviewState) => run(p.id, () => api.setReviewState(p.id, state));

// The cursor's place in each text box, kept as the reviewer clicks and types.
const cursors = reactive<Record<string, number>>({});
const trackCursor = (p: GoverningReviewProvision, event: Event) => (cursors[p.id] = (event.target as HTMLTextAreaElement).selectionStart ?? 0);
const canSplit = (p: GoverningReviewProvision) => {
  const at = cursors[p.id] ?? 0;
  return isDraft.value && !dirty(p) && at > 0 && at < asShownInTextBox(p.text).length;
};
const split = (p: GoverningReviewProvision) =>
  run(
    p.id,
    () => api.splitProvision(p.id, storedOffset(p.text, cursors[p.id] ?? 0)),
    "Split in two",
    [p.id]
  );

const indexOf = (p: GoverningReviewProvision) => provisions.value.findIndex((x) => x.id === p.id);
const nextOf = (p: GoverningReviewProvision) => provisions.value[indexOf(p) + 1] ?? null;
const merge = (p: GoverningReviewProvision) => {
  const next = nextOf(p);
  if (!next) return;
  return run(p.id, () => api.mergeProvision(p.id), "Merged", [p.id, next.id]);
};
const move = (p: GoverningReviewProvision, by: -1 | 1) => {
  const ids = provisions.value.map((x) => x.id);
  const from = indexOf(p);
  const to = from + by;
  if (to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to]!, ids[from]!];
  return run(p.id, () => api.reorderProvisions(documentId.value, ids));
};

// Drag a provision by its handle onto another to put it there. The server
// gets the whole new order, as with the arrows, and records it.
const dragging = ref<string | null>(null);
const dragOver = ref<string | null>(null);
const canDrag = (p: GoverningReviewProvision) => isDraft.value && !busy.value && !anyDirty.value && !!p;
const startDrag = (p: GoverningReviewProvision, event: DragEvent) => {
  dragging.value = p.id;
  event.dataTransfer?.setData("text/plain", p.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
};
const endDrag = () => {
  dragging.value = null;
  dragOver.value = null;
};
const dropOn = (target: GoverningReviewProvision) => {
  const moved = dragging.value;
  endDrag();
  if (!moved || moved === target.id) return;
  const ids = provisions.value.map((x) => x.id);
  const from = ids.indexOf(moved);
  const to = ids.indexOf(target.id);
  if (from < 0 || to < 0) return;
  ids.splice(from, 1);
  ids.splice(to, 0, moved);
  return run(moved, () => api.reorderProvisions(documentId.value, ids));
};

// The page image can be turned and enlarged in place: a survey sheet is often
// scanned sideways. This changes how it is shown here, never the stored image.
const ZOOMS = [1, 1.5, 2, 3];
const zoom = ref(1);
const turn = ref(0);
const natural = ref<{ w: number; h: number } | null>(null);
const sideways = computed(() => turn.value % 180 !== 0);
const onImageLoad = (event: Event) => {
  const img = event.target as HTMLImageElement;
  natural.value = img.naturalWidth && img.naturalHeight ? { w: img.naturalWidth, h: img.naturalHeight } : null;
};
watch(groupIndex, () => {
  zoom.value = 1;
  turn.value = 0;
  natural.value = null;
});
const stepZoom = (by: -1 | 1) => (zoom.value = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(zoom.value) + by))]!);
const frameStyle = computed(() => {
  const n = natural.value;
  return { width: `${zoom.value * 100}%`, ...(n ? { aspectRatio: sideways.value ? `${n.h} / ${n.w}` : `${n.w} / ${n.h}` } : {}) };
});
const imageStyle = computed(() => {
  const n = natural.value;
  if (!n) return {};
  // Turned a quarter, the image is as wide as the frame is tall.
  return { width: sideways.value ? `${(n.w / n.h) * 100}%` : "100%", transform: `translate(-50%, -50%) rotate(${turn.value}deg)` };
});

const publish = async () => {
  const ok = await confirm({
    title: "Publish this document?",
    body: `Members will be able to read and search all ${provisions.value.length} provisions. Later changes to the text are recorded edits that need a reason.`,
    confirmLabel: "Publish",
  });
  if (!ok) return;
  await run("publish", async () => {
    await api.publishDocument(documentId.value);
    await navigateTo(buildOrgPath(`/governing/${documentId.value}`));
  }, "Published");
};
const unpublish = async () => {
  const ok = await confirm({
    title: "Unpublish this document?",
    body: "Members stop seeing it, its provisions and its state law notes until it is published again. Nothing is deleted, and the reason is recorded.",
    confirmLabel: "Unpublish",
    destructive: true,
  });
  if (!ok) return;
  await run("unpublish", async () => {
    await api.unpublishDocument(documentId.value, reason.value.trim());
    reason.value = "";
  }, "Unpublished");
};
const removeDraft = async () => {
  const ok = await confirm({
    title: "Delete this draft?",
    body: "The draft, its provisions, the uploaded original and its page images are deleted. This cannot be undone.",
    confirmLabel: "Delete Draft",
    destructive: true,
  });
  if (!ok) return;
  await run("delete", async () => {
    await api.deleteDraft(documentId.value);
    await navigateTo(buildOrgPath("/governing"));
  }, "Draft deleted");
};

const markerList = (p: GoverningReviewProvision) => OCR_MARKERS.filter((m) => p.markers[m] > 0).map((m) => ({ marker: m, count: p.markers[m], blocking: m === BLOCKING_MARKER }));
const blockerText = computed(() => {
  const b = data.value?.blockers;
  if (!b) return "";
  if (!b.provisions) return "This document has no provisions yet.";
  const parts = [];
  if (b.unreviewed) parts.push(`${b.unreviewed} not reviewed yet`);
  if (b.illegible) parts.push(`${b.illegible} still containing ${BLOCKING_MARKER}`);
  if (b.uncited) parts.push(`${b.uncited} with no citation`);
  return parts.join(" · ");
});
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="space-y-6">
      <div v-if="waiting" class="py-24 flex justify-center"><div class="spinner-ios" /></div>

      <template v-else-if="!doc">
        <BackLink :to="buildOrgPath('/governing')" label="Governing documents" />
        <AppEmptyState
          icon="lucide:lock"
          title="Nothing to review here"
          description="Only the board and administrators can review a document, or it may have been removed."
        />
      </template>

      <template v-else>
        <AppPageHeader
          :eyebrow="`Review · ${kindLabel(doc.kind)}`"
          :title="doc.title ?? 'Untitled document'"
          :back-to="buildOrgPath(`/governing/${doc.id}`)"
          back-label="Document"
        />

        <div class="ios-card p-4 space-y-3" data-testid="governing-review-summary">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Badge variant="secondary">{{ statusLabel(doc.status) }}</Badge>
            <span class="type-meta t-text-secondary flex-1 min-w-0">
              {{ reviewedCount }} of {{ provisions.length }} {{ provisions.length === 1 ? "provision" : "provisions" }} reviewed
              <template v-if="isDraft && blockerText"> · {{ blockerText }}</template>
            </span>
            <template v-if="isDraft">
              <Button variant="ghost" size="sm" class="text-destructive" :disabled="!!busy" @click="removeDraft">Delete Draft</Button>
              <Button size="sm" :disabled="!data?.can_publish || anyDirty || !!busy" @click="publish">Publish</Button>
            </template>
            <Button
              v-else-if="doc.status === 'published'"
              variant="ghost"
              size="sm"
              class="text-destructive"
              :disabled="!!busy || anyDirty || !reason.trim()"
              :title="reason.trim() ? undefined : 'Give a reason below first'"
              @click="unpublish"
            >
              Unpublish
            </Button>
            <NuxtLink :to="{ path: buildOrgPath('/governing/audit'), query: { document: doc.id } }" class="type-meta t-text-accent underline">
              Change History
            </NuxtLink>
          </div>
          <p class="type-meta t-text-muted">
            <template v-if="isDraft">
              Check each provision against the page image, word for word. The text was read by software and keeps the original's spelling and
              spacing: do not correct what the page really says. Replace every {{ BLOCKING_MARKER }} with what the page shows; [signature], [seal] and
              [drawing] may stay. Every change here is recorded.
            </template>
            <template v-else>
              This document is published. An edit takes effect for members at once, is recorded, and needs a reason. So does unpublishing it.
            </template>
          </p>
          <div v-if="!isDraft" class="space-y-1.5">
            <Label for="governing-review-reason">Reason for the edit or for unpublishing</Label>
            <Input id="governing-review-reason" v-model="reason" placeholder="For example, corrected against the recorded page" />
          </div>
        </div>

        <GoverningDocumentDetails :document="doc" :org-id="selectedOrgId" @saved="refresh()" />

        <div v-if="groups.length > 1" class="flex flex-wrap items-center gap-2" data-testid="governing-review-pages">
          <Button
            v-for="(g, i) in groups"
            :key="g.key"
            :variant="i === groupIndex ? 'default' : 'outline'"
            size="sm"
            @click="groupIndex = i"
          >
            {{ g.label }}
            <span v-if="groupOpen(g)" class="ml-1.5 opacity-70">{{ groupOpen(g) }} open</span>
            <Icon v-else-if="g.provisions.length" name="lucide:check" class="w-3.5 h-3.5 ml-1.5" />
          </Button>
        </div>

        <AppEmptyState
          v-if="!group"
          icon="lucide:scroll-text"
          title="No provisions to review yet"
          description="Prepare the pages and propose provisions on the document first."
          size="sm"
        />

        <div v-else class="grid grid-cols-1 gap-6" :class="group.image ? 'lg:grid-cols-2' : ''">
          <div v-if="group.image" class="space-y-2 lg:sticky lg:top-4 lg:self-start">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="type-section t-text">{{ group.label }}, as scanned</h2>
              <div class="flex items-center gap-1" data-testid="governing-review-image-tools">
                <Button size="sm" variant="ghost" aria-label="Turn left" @click="turn = (turn + 270) % 360">
                  <Icon name="lucide:rotate-ccw" class="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" aria-label="Turn right" @click="turn = (turn + 90) % 360">
                  <Icon name="lucide:rotate-cw" class="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" aria-label="Smaller" :disabled="zoom === ZOOMS[0]" @click="stepZoom(-1)">
                  <Icon name="lucide:zoom-out" class="w-4 h-4" />
                </Button>
                <span class="type-meta t-text-muted tabular-nums w-10 text-center">{{ Math.round(zoom * 100) }}%</span>
                <Button size="sm" variant="ghost" aria-label="Larger" :disabled="zoom === ZOOMS[ZOOMS.length - 1]" @click="stepZoom(1)">
                  <Icon name="lucide:zoom-in" class="w-4 h-4" />
                </Button>
                <a :href="getAuthUrl(group.image) ?? undefined" target="_blank" rel="noopener" class="type-meta t-text-accent underline ml-2">Open Full Size</a>
              </div>
            </div>
            <div class="ios-card overflow-auto max-h-[80vh]">
              <div class="relative" :style="frameStyle">
                <img
                  :key="group.key"
                  :src="getAuthUrl(group.image) ?? undefined"
                  :alt="`${group.label} of the original document`"
                  :class="natural ? 'absolute top-1/2 left-1/2 max-w-none' : 'w-full'"
                  :style="imageStyle"
                  data-testid="governing-review-image"
                  @load="onImageLoad"
                />
              </div>
            </div>
          </div>

          <div class="space-y-4 min-w-0">
            <h2 class="type-section t-text">{{ group.image ? "Text taken from this page" : "Provisions" }}</h2>
            <p v-if="!group.provisions.length" class="type-meta t-text-muted">No provision starts on this page.</p>

            <article
              v-for="p in group.provisions"
              :key="p.id"
              class="ios-card p-4 space-y-3"
              :class="[dragOver === p.id && dragging !== p.id ? 'ring-2 ring-primary' : '', dragging === p.id ? 'opacity-60' : '']"
              data-testid="governing-review-provision"
              @dragover="dragging && ($event.preventDefault(), (dragOver = p.id))"
              @drop.prevent="dropOn(p)"
            >
              <div class="flex flex-wrap items-center gap-2">
                <span
                  v-if="isDraft"
                  class="cursor-grab t-text-muted"
                  :class="canDrag(p) ? '' : 'opacity-40 cursor-not-allowed'"
                  :draggable="canDrag(p)"
                  role="img"
                  aria-label="Drag to reorder"
                  title="Drag onto another provision to move this one there"
                  data-testid="governing-review-drag"
                  @dragstart="startDrag(p, $event)"
                  @dragend="endDrag"
                >
                  <Icon name="lucide:grip-vertical" class="w-4 h-4" />
                </span>
                <Badge :variant="p.review_state === 'ocr_draft' ? 'secondary' : 'default'">{{ REVIEW_STATE_LABELS[p.review_state] }}</Badge>
                <span class="type-meta t-text-muted">{{ indexOf(p) + 1 }} of {{ provisions.length }}</span>
                <span
                  v-for="m in markerList(p)"
                  :key="m.marker"
                  class="type-micro px-1.5 py-0.5 rounded border t-border"
                  :class="m.blocking ? 'text-destructive border-destructive' : 't-text-secondary'"
                >
                  {{ m.marker }} × {{ m.count }}
                </span>
                <span v-if="dirty(p)" class="type-micro t-text-accent">Not saved</span>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div class="space-y-1">
                  <Label :for="`label-${p.id}`" class="type-micro">Label as printed</Label>
                  <Input :id="`label-${p.id}`" v-model="draftOf(p).original_label" placeholder=".5" />
                </div>
                <div class="space-y-1">
                  <Label :for="`citation-${p.id}`" class="type-micro">Citation</Label>
                  <Input :id="`citation-${p.id}`" v-model="draftOf(p).citation" placeholder="By-Law 3.5" />
                </div>
                <div class="space-y-1">
                  <Label :for="`heading-${p.id}`" class="type-micro">Heading</Label>
                  <Input :id="`heading-${p.id}`" v-model="draftOf(p).heading" placeholder="Proxies" />
                </div>
              </div>

              <div class="space-y-1">
                <Label :for="`text-${p.id}`" class="type-micro">Text, exactly as on the page</Label>
                <textarea
                  :id="`text-${p.id}`"
                  v-model="draftOf(p).text"
                  class="w-full rounded-md border t-border bg-transparent px-3 py-2 font-mono text-sm leading-relaxed whitespace-pre-wrap"
                  :rows="Math.min(24, Math.max(3, draftOf(p).text.split('\n').length + 1))"
                  spellcheck="false"
                  autocomplete="off"
                  autocapitalize="off"
                  data-testid="governing-review-text"
                  @click="trackCursor(p, $event)"
                  @keyup="trackCursor(p, $event)"
                  @select="trackCursor(p, $event)"
                />
              </div>

              <!-- The saved text with its markers picked out, so none is missed in a long provision. -->
              <p v-if="markerList(p).length" class="type-meta t-text-secondary whitespace-pre-wrap font-mono text-xs border-l-2 t-border pl-3">
                <template v-for="(part, i) in splitAtMarkers(p.text)" :key="i"><mark
                  v-if="part.marker"
                  class="rounded px-0.5"
                  :class="part.marker === BLOCKING_MARKER ? 'bg-destructive/20 text-destructive' : 'bg-amber-200/60 text-inherit'"
                >{{ part.text }}</mark><template v-else>{{ part.text }}</template></template>
              </p>

              <div class="flex flex-wrap items-center gap-2">
                <template v-if="dirty(p)">
                  <Button size="sm" :disabled="!!busy || !draftOf(p).text.length || (!isDraft && !reason.trim())" @click="save(p)">
                    <Icon v-if="busy === p.id" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" /> Save Changes
                  </Button>
                  <Button variant="ghost" size="sm" :disabled="!!busy" @click="discard(p)">Discard</Button>
                  <span v-if="!isDraft && !reason.trim()" class="type-meta t-text-muted">Give a reason above to save.</span>
                </template>
                <template v-else>
                  <Button
                    v-if="p.review_state === 'ocr_draft'"
                    size="sm"
                    :disabled="!!busy || p.markers[BLOCKING_MARKER] > 0"
                    :title="p.markers[BLOCKING_MARKER] > 0 ? `Replace every ${BLOCKING_MARKER} first` : undefined"
                    @click="setState(p, 'reviewed')"
                  >
                    Mark Reviewed
                  </Button>
                  <Button v-if="p.review_state === 'reviewed'" size="sm" variant="outline" :disabled="!!busy" @click="setState(p, 'verified')">
                    Mark Verified
                  </Button>
                  <Button v-if="isDraft && p.review_state !== 'ocr_draft'" size="sm" variant="ghost" :disabled="!!busy" @click="setState(p, 'ocr_draft')">
                    Reopen
                  </Button>
                  <template v-if="isDraft">
                    <span class="flex-1" />
                    <Button size="sm" variant="outline" :disabled="!!busy || !canSplit(p)" title="Click in the text where the next provision starts" @click="split(p)">
                      <Icon name="lucide:scissors" class="w-4 h-4 mr-1.5" /> Split at Cursor
                    </Button>
                    <Button size="sm" variant="outline" :disabled="!!busy || !nextOf(p) || dirty(nextOf(p)!)" @click="merge(p)">
                      <Icon name="lucide:merge" class="w-4 h-4 mr-1.5" /> Merge with Next
                    </Button>
                    <Button size="sm" variant="ghost" :disabled="!!busy || indexOf(p) === 0" aria-label="Move up" @click="move(p, -1)">
                      <Icon name="lucide:arrow-up" class="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" :disabled="!!busy || !nextOf(p)" aria-label="Move down" @click="move(p, 1)">
                      <Icon name="lucide:arrow-down" class="w-4 h-4" />
                    </Button>
                  </template>
                </template>
              </div>
            </article>

            <details v-if="group.pageText" class="ios-card p-4">
              <summary class="type-meta t-text-secondary cursor-pointer">The whole page as it was read</summary>
              <p class="mt-3 whitespace-pre-wrap font-mono text-xs t-text-secondary">{{ group.pageText }}</p>
            </details>
          </div>
        </div>
      </template>
    </PageContainer>
  </div>
</template>

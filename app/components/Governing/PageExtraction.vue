<script setup lang="ts">
// Governing documents: turning an uploaded original into page images, page
// text and draft provisions (Session 3A). Managers only; the server decides
// again on every call. Three steps, each resumable:
//   1. Prepare pages: the browser renders each page and stores its image, with
//      the PDF's text layer where it has one.
//   2. Read scanned pages: pages with no text are read from their image. This
//      uses the community's AI credits, so it only runs when asked.
//   3. Propose provisions: the page text is cut at its headings into drafts.
// Everything made here is a draft that members never see.
import { toast } from "vue-sonner";
import type { GovPage, GovSource } from "#core/shared/governing/types";

const props = defineProps<{
  documentId: string;
  sources: GovSource[];
  pages: GovPage[];
  provisionCount: number;
  orgId: string | null | undefined;
  canManage?: boolean;
}>();
const emit = defineEmits<{ changed: [] }>();

const { getAuthUrl } = useDirectusFiles();
const { storePage, readPage, proposeProvisions } = useGoverningDocs(toRef(props, "orgId"));
const { open } = useGoverningPageRender();
const { isPreviewingMember } = useViewAs();
const manages = computed(() => !!props.canManage && !isPreviewingMember.value);

const rows = computed(() =>
  props.sources.map((source) => {
    const pages = props.pages.filter((p) => p.source === source.id);
    const total = source.page_count ?? (source.type?.startsWith("image/") ? 1 : null);
    return {
      source,
      total,
      stored: pages.length,
      withText: pages.filter((p) => p.extraction).length,
      unread: pages.filter((p) => !p.extraction && p.image),
      missing: total == null ? (pages.length ? 0 : 1) : Math.max(0, total - pages.length),
    };
  })
);
const anyText = computed(() => props.pages.some((p) => p.extraction));
const canPropose = computed(() => props.provisionCount === 0 && anyText.value);

// One job at a time: each step is a run of small requests.
const job = ref<{ source: string; kind: "prepare" | "read"; done: number; total: number } | null>(null);
const proposing = ref(false);
const stop = ref(false);
const message = (error: any, fallback: string) => error?.data?.message || error?.message || fallback;

const summary = (row: (typeof rows.value)[number]) => {
  if (!row.stored) return "Pages not prepared yet";
  const of = row.total ? ` of ${row.total}` : "";
  return `${row.stored}${of} ${row.stored === 1 && !row.total ? "page" : "pages"} prepared · text on ${row.withText}`;
};

const prepare = async (row: (typeof rows.value)[number]) => {
  const url = getAuthUrl(row.source.file);
  if (job.value || !url) return;
  stop.value = false;
  job.value = { source: row.source.id, kind: "prepare", done: 0, total: row.missing };
  try {
    const original = await open(url, row.source.type);
    try {
      const have = new Set(props.pages.filter((p) => p.source === row.source.id).map((p) => p.page_number));
      const todo = Array.from({ length: original.pageCount }, (_, i) => i + 1).filter((n) => !have.has(n));
      job.value.total = todo.length;
      for (const pageNumber of todo) {
        if (stop.value) break;
        const rendered = await original.render(pageNumber);
        await storePage(row.source.id, pageNumber, rendered.image, rendered.text);
        job.value.done += 1;
      }
    } finally {
      original.close();
    }
    if (!stop.value) toast.success("Pages prepared");
  } catch (error) {
    toast.error(message(error, "Could not prepare the pages."));
  } finally {
    job.value = null;
    emit("changed");
  }
};

const read = async (row: (typeof rows.value)[number]) => {
  if (job.value || !row.unread.length) return;
  stop.value = false;
  job.value = { source: row.source.id, kind: "read", done: 0, total: row.unread.length };
  try {
    for (const page of row.unread) {
      if (stop.value) break;
      await readPage(page.id);
      job.value.done += 1;
    }
    if (!stop.value) toast.success("Scanned pages read");
  } catch (error) {
    toast.error(message(error, "Could not read the scanned pages."));
  } finally {
    job.value = null;
    emit("changed");
  }
};

const propose = async () => {
  if (proposing.value || job.value) return;
  proposing.value = true;
  try {
    const result = await proposeProvisions(props.documentId);
    toast.success(`${result.provisions} draft ${result.provisions === 1 ? "provision" : "provisions"} proposed`);
    emit("changed");
  } catch (error) {
    toast.error(message(error, "Could not propose provisions."));
  } finally {
    proposing.value = false;
  }
};
</script>

<template>
  <section v-if="manages && sources.length" class="space-y-2" data-testid="governing-extraction">
    <h2 class="type-section t-text">Pages and text</h2>
    <p class="type-meta t-text-muted">
      Page images and the text taken from them are drafts. Members see a provision only after it has been reviewed and the document is published.
    </p>

    <ul class="ios-card divide-y t-border">
      <li v-for="row in rows" :key="row.source.id" class="px-4 py-3 space-y-2">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div class="flex-1 min-w-0">
            <p class="type-body t-text break-words">{{ row.source.filename ?? "Original document" }}</p>
            <p class="type-meta t-text-muted" data-testid="governing-extraction-summary">{{ summary(row) }}</p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <Button v-if="row.missing > 0" variant="outline" size="sm" :disabled="!!job" @click="prepare(row)">
              <Icon name="lucide:images" class="w-4 h-4 mr-1.5" /> {{ row.stored ? "Continue Preparing" : "Prepare Pages" }}
            </Button>
            <Button v-if="row.unread.length" variant="outline" size="sm" :disabled="!!job" @click="read(row)">
              <Icon name="lucide:scan-text" class="w-4 h-4 mr-1.5" /> Read {{ row.unread.length }} Scanned {{ row.unread.length === 1 ? "Page" : "Pages" }}
            </Button>
          </div>
        </div>
        <p v-if="row.unread.length && !job" class="type-meta t-text-muted">
          Reading a scanned page uses the community's AI credits, one page at a time. The result is a draft to check against the page image.
        </p>
        <div v-if="job?.source === row.source.id" class="flex items-center gap-3" role="status">
          <Icon name="lucide:loader-2" class="w-4 h-4 animate-spin t-text-muted" />
          <span class="type-meta t-text-secondary flex-1">
            {{ job.kind === "prepare" ? "Preparing" : "Reading" }} page {{ Math.min(job.done + 1, job.total) }} of {{ job.total }}. Keep this tab open.
          </span>
          <Button variant="ghost" size="sm" :disabled="stop" @click="stop = true">Stop</Button>
        </div>
      </li>
    </ul>

    <div v-if="canPropose" class="ios-card px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <p class="type-meta t-text-secondary flex-1 min-w-0">
        Cut the page text into draft provisions at its headings. The words are copied exactly; you fix the boundaries in review.
      </p>
      <Button size="sm" :disabled="proposing || !!job" @click="propose">
        <Icon v-if="proposing" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
        Propose Provisions
      </Button>
    </div>
  </section>
</template>

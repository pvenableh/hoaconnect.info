<script setup lang="ts">
/**
 * Spotlight — ⌘K / Ctrl-K search across the workspace.
 *
 * Two sources, one list:
 *   - DESTINATIONS, instantly and client-side: the dock apps (`useAppNav`) and
 *     every section link under them (`useSectionNav`), module-filtered the same
 *     way the dock and sub-nav are. Members get their own app set.
 *   - RECORDS, debounced, from `GET /api/search` — members, units, vendors,
 *     documents, meetings, requests, projects, channels. Org-scoped and
 *     capability-filtered on the server (core/shared/search). Staff only; for a
 *     member the box is destination search, and says so.
 *
 * Keyboard: ↑/↓ move, Enter opens, Esc closes — the Listbox under CommandDialog
 * owns all three. Results are grouped by kind.
 *
 * Built on the kit's CommandDialog, so it is the glass Dialog like every other
 * overlay. We filter ourselves rather than letting `Command` do it: Command
 * matches on each row's visible text, and a record the SERVER matched on a
 * field it does not display (a phone number, a request's description) would be
 * hidden by the client a moment after it arrived.
 *
 * CREATE — the create verbs (core/shared/create-verbs.ts), gated by
 * useCreateVerbs and matched as you type ("new", a noun, an alias like "dues").
 * Picking one runs it: the page that owns the form opens it (useCreateIntent).
 *
 * `searchFn` / `destinations` override the sources — /ui-kit uses them to show
 * the real component without a session.
 */
import { useDebounceFn } from "@vueuse/core";
import { ListboxFilter } from "reka-ui";
import { CommandDialog, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import type { SearchGroupResult } from "#core/shared/search";
import { MIN_QUERY } from "#core/shared/search";
import type { VerbId } from "#core/shared/create-verbs";

interface Destination {
  key: string;
  label: string;
  description?: string;
  icon: string;
  to: string;
  section: string;
}

const props = defineProps<{
  searchFn?: (q: string) => Promise<SearchGroupResult[]>;
  destinations?: Destination[];
}>();

const { isOpen, close, toggle } = useSpotlight();
const createVerbs = useCreateVerbs();
const router = useRouter();
const route = useRoute();
const { appsFor } = useAppNav();
const { sectionLinksFor, buildOrgPath } = useSectionNav();
const { isEnabled } = useModules();
const access = useCurrentDomainAccess();
const { isPreviewingMember } = useViewAs();
const selectedOrgId = useState<string | null>("selectedOrgId", () => null);

const isOnOrgPage = computed(() => !!route.params.slug);
const adminUI = computed(
  () => !isPreviewingMember.value && isOnOrgPage.value && access.isAdminOfCurrentDomain.value,
);
// Record search is offered to the same hats the assistant is: the server
// re-checks per group, this only decides whether to ask.
const canSearchRecords = computed(
  () =>
    !!props.searchFn ||
    (!isPreviewingMember.value &&
      isOnOrgPage.value &&
      !!selectedOrgId.value &&
      (access.isAdminOfCurrentDomain.value ||
        access.isBoardMemberOfCurrentDomain.value ||
        access.isPropertyManagerOfCurrentDomain.value)),
);

const allDestinations = computed<Destination[]>(() => {
  if (props.destinations) return props.destinations;
  const out: Destination[] = [];
  const seen = new Set<string>();
  for (const app of appsFor(adminUI.value)) {
    const links = adminUI.value ? sectionLinksFor(app.key) : [];
    if (!links.length && !seen.has(app.path)) {
      seen.add(app.path);
      out.push({ key: `app:${app.key}`, label: app.label, icon: `lucide:${app.icon}`, to: app.path, section: "Go to" });
    }
    for (const l of links) {
      if (seen.has(l.path)) continue;
      seen.add(l.path);
      out.push({
        key: `link:${l.path}`,
        label: l.label,
        description: l.description,
        icon: `lucide:${l.icon}`,
        to: l.path,
        section: "Go to",
      });
    }
  }
  return out;
});

const query = ref("");
const recordGroups = ref<SearchGroupResult[]>([]);
const searching = ref(false);
let searchSeq = 0;

const runSearch = useDebounceFn(async (q: string) => {
  const seq = ++searchSeq;
  if (q.length < MIN_QUERY || !canSearchRecords.value) {
    recordGroups.value = [];
    searching.value = false;
    return;
  }
  searching.value = true;
  try {
    const groups = props.searchFn
      ? await props.searchFn(q)
      : (
          await $fetch<{ groups: SearchGroupResult[] }>("/api/search", {
            query: { q, orgId: selectedOrgId.value },
          })
        ).groups;
    // A slower response for an older query must not overwrite a newer one.
    if (seq !== searchSeq) return;
    recordGroups.value = (groups || []).filter((g) => !g.module || isEnabled(g.module));
  } catch {
    if (seq === searchSeq) recordGroups.value = [];
  } finally {
    if (seq === searchSeq) searching.value = false;
  }
}, 200);

watch(query, (q) => runSearch(q.trim()));

const matchingDestinations = computed(() => {
  const q = query.value.trim().toLowerCase();
  const list = allDestinations.value;
  if (!q) return list.slice(0, 8);
  return list.filter(
    (d) => d.label.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q),
  );
});

// Off for the /ui-kit demo (its sources are sample data, not this session).
const matchingVerbs = computed(() =>
  props.destinations || props.searchFn ? [] : createVerbs.matching(query.value),
);

const nothingFound = computed(
  () =>
    query.value.trim().length >= MIN_QUERY &&
    !searching.value &&
    !matchingDestinations.value.length &&
    !matchingVerbs.value.length &&
    !recordGroups.value.some((g) => g.items.length),
);

watch(isOpen, (open) => {
  if (open) {
    query.value = "";
    recordGroups.value = [];
  }
});

// Enter before any row is highlighted (you typed and hit return) opens the
// first result. Reka's Listbox only selects a HIGHLIGHTED row, and nothing is
// highlighted until an arrow key or the pointer moves — so without this the
// most natural ⌘K → type → Enter did nothing.
const firstResultTo = computed(
  () => matchingDestinations.value[0]?.to ?? recordGroups.value.find((g) => g.items.length)?.items[0]?.to,
);
const onEnter = (e: KeyboardEvent) => {
  const list = (e.target as HTMLElement).closest('[data-slot="command"]');
  if (list?.querySelector("[data-highlighted]")) return;
  // Groups render Go to → Create → records, and Enter takes the first row.
  const firstVerb = !matchingDestinations.value.length ? matchingVerbs.value[0] : undefined;
  if (firstVerb) {
    e.preventDefault();
    runVerb(firstVerb.id);
    return;
  }
  if (!firstResultTo.value) return;
  e.preventDefault();
  go(firstResultTo.value);
};

// "Message …" — a member hit with a login becomes a direct message (Phase 7.3).
// Offered only where channels are on, and never for yourself; the server
// refuses anyone who isn't an admin / board member.
const { user: currentUser } = useDirectusAuth();
const { startDirectMessage } = useDirectMessages();
const messageHits = computed(() =>
  isEnabled("channels")
    ? (recordGroups.value.find((g) => g.key === "members")?.items ?? [])
        .filter((h) => h.userId && h.userId !== currentUser.value?.id)
        .slice(0, 3)
    : [],
);
const messageMember = (userId: string) => {
  close();
  void startDirectMessage(userId);
};

const runVerb = (id: VerbId) => {
  close();
  createVerbs.run(id);
};

const go = (to: string) => {
  close();
  router.push(props.destinations || props.searchFn ? to : buildOrgPath(to));
};

// ⌘K on macOS, Ctrl-K elsewhere. Captured at the window so it works from inside
// an input too — the shortcut is "search from anywhere", and a text field is
// where you most often are when you want it.
const onKeydown = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
    e.preventDefault();
    toggle();
  }
};
onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));

const placeholder = computed(() =>
  canSearchRecords.value ? "Search members, units, documents, or go to…" : "Go to…",
);
</script>

<template>
  <CommandDialog
    v-model:open="isOpen"
    title="Search"
    description="Search records and jump to any part of the workspace."
  >
    <div data-slot="command-input-wrapper" class="flex h-12 items-center gap-2.5 border-b border-border/60 px-4">
      <Icon name="lucide:search" class="size-4 shrink-0 text-muted-foreground" />
      <ListboxFilter
        v-model="query"
        auto-focus
        data-spotlight-input
        :placeholder="placeholder"
        @keydown.enter="onEnter"
        class="h-full w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
      />
      <kbd class="type-micro type-flush rounded-md px-1.5 py-0.5 glass-field">esc</kbd>
    </div>

    <CommandList class="max-h-[min(60vh,420px)] p-1.5">
      <CommandGroup v-if="matchingDestinations.length" heading="Go to">
        <CommandItem
          v-for="d in matchingDestinations"
          :key="d.key"
          :value="d.key"
          class="gap-3 rounded-lg px-2.5 py-2"
          @select="go(d.to)"
        >
          <Icon :name="d.icon" class="size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">{{ d.label }}</span>
            <span v-if="d.description" class="block truncate text-xs text-muted-foreground">{{ d.description }}</span>
          </span>
        </CommandItem>
      </CommandGroup>

      <CommandGroup v-if="matchingVerbs.length" heading="Create" data-spotlight-group="create">
        <CommandItem
          v-for="v in matchingVerbs"
          :key="v.id"
          :value="`verb:${v.id}`"
          class="gap-3 rounded-lg px-2.5 py-2"
          :data-spotlight-verb="v.id"
          @select="runVerb(v.id)"
        >
          <Icon :name="v.icon" class="size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ v.label }}</span>
        </CommandItem>
      </CommandGroup>

      <CommandGroup v-if="messageHits.length" heading="Message" data-spotlight-group="message">
        <CommandItem
          v-for="hit in messageHits"
          :key="`message:${hit.id}`"
          :value="`message:${hit.id}`"
          class="gap-3 rounded-lg px-2.5 py-2"
          data-spotlight-message
          @select="messageMember(hit.userId!)"
        >
          <Icon name="lucide:message-circle" class="size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1 truncate text-sm font-medium">Message {{ hit.name }}</span>
        </CommandItem>
      </CommandGroup>

      <CommandGroup v-for="g in recordGroups" :key="g.key" :heading="g.label" :data-spotlight-group="g.key">
        <CommandItem
          v-for="hit in g.items"
          :key="`${g.key}:${hit.id}`"
          :value="`${g.key}:${hit.id}`"
          class="gap-3 rounded-lg px-2.5 py-2"
          data-spotlight-hit
          @select="go(hit.to)"
        >
          <Icon :name="g.icon" class="size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">{{ hit.name }}</span>
            <span v-if="hit.description" class="block truncate text-xs text-muted-foreground">{{ hit.description }}</span>
          </span>
        </CommandItem>
      </CommandGroup>

      <p v-if="searching" class="helper-text px-3 py-2">Searching records…</p>
      <p v-else-if="nothingFound" class="helper-text px-3 py-6 text-center">
        Nothing matches “{{ query.trim() }}”.
      </p>
      <p v-else-if="query.trim().length === 1" class="helper-text px-3 py-6 text-center">Keep typing…</p>
    </CommandList>
  </CommandDialog>
</template>

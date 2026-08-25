<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const { list: listMeetings } = useDirectusItems("hoa_meetings");
const { currentOrg, selectedOrgId } = await useSelectedOrg();
const organization = computed(() => currentOrg.value?.organization || null);
const orgId = computed(() => selectedOrgId.value);

const TYPE_ICONS: Record<string, string> = {
  board: "users",
  annual: "calendar-days",
  special: "star",
  committee: "users-round",
};

const { data: meetings } = await useAsyncData(
  `hoa-meetings-member-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    try {
      return (
        (await listMeetings({
          fields: [
            "id",
            "title",
            "type",
            "status",
            "meeting_date",
            "location",
            "virtual_url",
            "agenda",
            "minutes",
            "recording_url",
            "attendees.id",
            "attendees.hoa_member.first_name",
            "attendees.hoa_member.last_name",
            "attendees.role_at_meeting",
            "attendees.is_board_member",
            "attendees.attendance",
          ],
          filter: { organization: { _eq: orgId.value }, is_published: { _eq: true } },
          sort: ["-meeting_date"],
        })) || []
      );
    } catch (e) {
      console.error("Error fetching meetings:", e);
      return [];
    }
  },
  { watch: [orgId], server: false }
);

const now = computed(() => new Date());
const upcoming = computed(() =>
  (meetings.value || [])
    .filter((m: any) => m.meeting_date && new Date(m.meeting_date) >= now.value && m.status !== "completed")
    .sort((a: any, b: any) => +new Date(a.meeting_date) - +new Date(b.meeting_date))
);
const past = computed(() =>
  (meetings.value || []).filter(
    (m: any) => !(m.meeting_date && new Date(m.meeting_date) >= now.value && m.status !== "completed")
  )
);

const formatDateTime = (d?: string | null) => {
  if (!d) return "No date set";
  return new Date(d).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};
const memberName = (m: any) =>
  m ? `${m.first_name || ""} ${m.last_name || ""}`.trim() || "Member" : "Member";

const selected = ref<any | null>(null);
const showDetail = ref(false);
const openDetail = (m: any) => {
  selected.value = m;
  showDetail.value = true;
};

// A meeting has no detail PAGE — `notificationTargetPath` sends a meeting
// notification to this list, not to a deep link — so the detail DIALOG is the
// moment the member has actually opened the thing they were told about. The
// getter returns null while the dialog is shut, so merely scrolling past a
// meeting in the list never clears its badge.
useMarkItemRead("hoa_meetings", () =>
  showDetail.value ? (selected.value?.id ? String(selected.value.id) : null) : null,
);
</script>

<template>
  <div class="min-h-screen t-bg">
    <PageContainer class="space-y-6">
        <AppPageHeader
          :eyebrow="organization?.name"
          title="Meetings"
          description="Notices, agendas, minutes and recordings for your community."
        />

        <section v-if="upcoming.length" class="space-y-3">
          <h2 class="type-micro t-text-secondary">Upcoming</h2>
          <!-- The cards get their own container so `.stagger-item`'s :nth-child
               counts cards and starts the first one at 0ms; as direct children of
               the section the <h2> would have taken the first slot. -->
          <div class="grid gap-3">
          <button
            v-for="m in upcoming"
            :key="m.id"
            class="stagger-item ios-card p-4 w-full text-left ios-press"
            @click="openDetail(m)"
          >
            <div class="flex items-center gap-2">
              <Icon :name="'i-lucide-' + (TYPE_ICONS[m.type] || 'users')" class="size-4 t-accent-app" />
              <h3 class="font-semibold t-text">{{ m.title }}</h3>
            </div>
            <p class="text-sm t-text-muted mt-1">
              <Icon name="i-lucide-calendar" class="size-3.5 inline -mt-0.5 mr-1" />
              {{ formatDateTime(m.meeting_date) }}
              <span v-if="m.location"> · {{ m.location }}</span>
            </p>
          </button>
          </div>
        </section>

        <section v-if="past.length" class="space-y-3">
          <h2 class="type-micro t-text-secondary">Past</h2>
          <div class="grid gap-3">
          <button
            v-for="m in past"
            :key="m.id"
            class="stagger-item ios-card p-4 w-full text-left ios-press"
            @click="openDetail(m)"
          >
            <div class="flex items-center gap-2">
              <Icon :name="'i-lucide-' + (TYPE_ICONS[m.type] || 'users')" class="size-4 t-text-muted" />
              <h3 class="font-semibold t-text">{{ m.title }}</h3>
            </div>
            <p class="text-sm t-text-muted mt-1">
              <Icon name="i-lucide-calendar" class="size-3.5 inline -mt-0.5 mr-1" />
              {{ formatDateTime(m.meeting_date) }}
            </p>
            <div class="flex items-center gap-3 mt-1 text-xs t-text-muted">
              <span v-if="m.minutes"><Icon name="i-lucide-file-text" class="size-3.5 inline -mt-0.5 mr-0.5" />Minutes</span>
              <span v-if="m.recording_url"><Icon name="i-lucide-video" class="size-3.5 inline -mt-0.5 mr-0.5" />Recording</span>
            </div>
          </button>
          </div>
        </section>

        <!-- The empty state is a sibling of both sections, not a child of Past.
             It used to live inside it, which meant a community with upcoming
             meetings and no past ones still rendered a bare "PAST" heading with
             nothing under it. -->
        <div v-if="!upcoming.length && !past.length" class="ios-card">
          <AppEmptyState
            icon="lucide:calendar-off"
            title="No meetings published yet"
            description="Notices, agendas and minutes appear here once your board publishes them."
          />
        </div>
      </PageContainer>

    <Dialog v-model:open="showDetail">
      <DialogContent v-if="selected" class="ui-kit max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{{ selected.title }}</DialogTitle>
          <DialogDescription>{{ formatDateTime(selected.meeting_date) }}</DialogDescription>
        </DialogHeader>

        <div class="space-y-5 py-2">
          <div v-if="selected.location || selected.virtual_url" class="text-sm t-text-secondary space-y-1">
            <p v-if="selected.location"><Icon name="i-lucide-map-pin" class="size-4 inline -mt-0.5 mr-1" />{{ selected.location }}</p>
            <p v-if="selected.virtual_url">
              <Icon name="i-lucide-video" class="size-4 inline -mt-0.5 mr-1" />
              <a :href="selected.virtual_url" target="_blank" class="t-accent-app underline">Join virtually</a>
            </p>
          </div>

          <div v-if="selected.agenda">
            <h4 class="type-micro t-text-secondary mb-1">Agenda</h4>
            <div class="prose prose-sm max-w-none t-text-secondary" v-html="selected.agenda" />
          </div>

          <div v-if="selected.minutes">
            <h4 class="type-micro t-text-secondary mb-1">Minutes</h4>
            <div class="prose prose-sm max-w-none t-text-secondary" v-html="selected.minutes" />
          </div>

          <div v-if="selected.recording_url">
            <h4 class="type-micro t-text-secondary mb-1">Recording</h4>
            <a :href="selected.recording_url" target="_blank" class="t-accent-app underline text-sm">
              <Icon name="i-lucide-play-circle" class="size-4 inline -mt-0.5 mr-1" />Watch recording
            </a>
          </div>

          <div v-if="selected.attendees?.length">
            <h4 class="type-micro t-text-secondary mb-2">Attendees</h4>
            <ul class="space-y-1.5">
              <li v-for="a in selected.attendees" :key="a.id" class="flex items-center justify-between text-sm">
                <span class="t-text">{{ memberName(a.hoa_member) }}</span>
                <span class="flex items-center gap-2">
                  <span v-if="a.is_board_member" class="rounded-full px-2 py-0.5 text-[10px] font-medium t-bg-accent/20 t-text-accent">
                    {{ a.role_at_meeting }}
                  </span>
                  <span class="text-xs t-text-muted capitalize">{{ a.attendance }}</span>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

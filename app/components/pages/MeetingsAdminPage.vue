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

const {
  list: listMeetings,
  create: createMeeting,
  update: updateMeeting,
  remove: removeMeeting,
} = useDirectusItems("hoa_meetings");
const {
  list: listAttendees,
  create: createAttendee,
  remove: removeAttendee,
} = useDirectusItems("hoa_meeting_attendees");
const { list: listMembers } = useDirectusItems("hoa_members");
const { list: listBoardTerms } = useDirectusItems("hoa_board_members");

const { currentOrg, selectedOrgId } = await useSelectedOrg();
const organization = computed(() => currentOrg.value?.organization || null);
const orgId = computed(() => selectedOrgId.value);

const TYPE_OPTIONS = [
  { value: "board", label: "Board Meeting", icon: "users" },
  { value: "annual", label: "Annual Meeting", icon: "calendar-days" },
  { value: "special", label: "Special Meeting", icon: "star" },
  { value: "committee", label: "Committee Meeting", icon: "users-round" },
];
const STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Canceled" },
];
const AUDIENCE_OPTIONS = [
  { value: "all", label: "Everyone" },
  { value: "owners", label: "Owners" },
  { value: "tenants", label: "Tenants" },
  { value: "board_members", label: "Board Members" },
];
const BOARD_TITLE_LABELS: Record<string, string> = {
  president: "President",
  vice_president: "Vice President",
  secretary: "Secretary",
  treasurer: "Treasurer",
  director: "Director",
};

const typeInfo = (t?: string | null) =>
  TYPE_OPTIONS.find((o) => o.value === t) || TYPE_OPTIONS[0];

// ---- Data ----
const { data: meetings, refresh: refreshMeetings } = await useAsyncData(
  `hoa-meetings-admin-${orgId.value}`,
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
            "end_date",
            "location",
            "virtual_url",
            "agenda",
            "minutes",
            "recording_url",
            "is_published",
            "target_audience",
            "date_created",
            "attendees.id",
            "attendees.hoa_member.id",
            "attendees.hoa_member.first_name",
            "attendees.hoa_member.last_name",
            "attendees.role_at_meeting",
            "attendees.is_board_member",
            "attendees.attendance",
            "attendees.board_term.id",
          ],
          filter: { organization: { _eq: orgId.value } },
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

const { data: members } = await useAsyncData(
  `hoa-meetings-members-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    try {
      return (
        (await listMembers({
          fields: ["id", "first_name", "last_name", "member_type"],
          filter: { organization: { _eq: orgId.value }, status: { _in: ["active", "inactive"] } },
          sort: ["last_name", "first_name"],
          limit: -1,
        })) || []
      );
    } catch {
      return [];
    }
  },
  { watch: [orgId], server: false }
);

const { data: boardTerms } = await useAsyncData(
  `hoa-meetings-board-${orgId.value}`,
  async () => {
    if (!orgId.value) return [];
    try {
      return (
        (await listBoardTerms({
          fields: ["id", "title", "term_start", "term_end", "hoa_member.id"],
          filter: { hoa_member: { organization: { _eq: orgId.value } } },
          limit: -1,
        })) || []
      );
    } catch {
      return [];
    }
  },
  { watch: [orgId], server: false }
);

// ---- Grouping ----
const now = computed(() => new Date());
const upcoming = computed(() =>
  (meetings.value || [])
    .filter((m: any) => m.meeting_date && new Date(m.meeting_date) >= now.value && m.status !== "completed")
    .sort((a: any, b: any) => +new Date(a.meeting_date) - +new Date(b.meeting_date))
);
const past = computed(() =>
  (meetings.value || [])
    .filter((m: any) => !(m.meeting_date && new Date(m.meeting_date) >= now.value && m.status !== "completed"))
);

// ---- Helpers ----
const memberName = (m: any) => {
  if (!m) return "Unknown";
  const id = typeof m === "object" ? m.id : m;
  const rec = (members.value || []).find((x: any) => x.id === id) || (typeof m === "object" ? m : null);
  return rec ? `${rec.first_name || ""} ${rec.last_name || ""}`.trim() || "Unnamed" : "Unknown";
};

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

// Find the active board term for a member as of a date (snapshot source)
const activeTermFor = (memberId: string, dateISO: string) => {
  const d = dateISO ? new Date(dateISO) : new Date();
  return (boardTerms.value || []).find((t: any) => {
    const tid = typeof t.hoa_member === "object" ? t.hoa_member?.id : t.hoa_member;
    if (tid !== memberId) return false;
    const start = t.term_start ? new Date(t.term_start) : null;
    const end = t.term_end ? new Date(t.term_end) : null;
    return (!start || start <= d) && (!end || end >= d);
  });
};

// ---- Form ----
const DEFAULT_TIME = "18:00";
const showModal = ref(false);
const editingId = ref<string | null>(null);
const saving = ref(false);

interface AttendeeRow {
  id?: string; // existing attendee record id
  hoa_member: string;
  role_at_meeting: string;
  board_term: string | null;
  is_board_member: boolean;
  attendance: string;
}

const form = reactive({
  title: "",
  type: "board" as string,
  status: "scheduled" as string,
  meeting_date_date: "",
  meeting_date_time: DEFAULT_TIME,
  location: "",
  virtual_url: "",
  agenda: "",
  minutes: "",
  recording_url: "",
  is_published: false,
  target_audience: "all" as string,
});
const formAttendees = ref<AttendeeRow[]>([]);
const originalAttendeeIds = ref<string[]>([]);
const attendeePick = ref<string>("");

const meetingDateISO = computed(() =>
  form.meeting_date_date
    ? `${form.meeting_date_date}T${form.meeting_date_time || DEFAULT_TIME}:00.000-05:00`
    : null
);

const parseDatetime = (dt?: string | null) => {
  if (!dt) return { date: "", time: DEFAULT_TIME };
  const d = new Date(dt);
  const date = d.toISOString().split("T")[0];
  const time = `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
  return { date, time };
};

const resetForm = () => {
  form.title = "";
  form.type = "board";
  form.status = "scheduled";
  form.meeting_date_date = "";
  form.meeting_date_time = DEFAULT_TIME;
  form.location = "";
  form.virtual_url = "";
  form.agenda = "";
  form.minutes = "";
  form.recording_url = "";
  form.is_published = false;
  form.target_audience = "all";
  formAttendees.value = [];
  originalAttendeeIds.value = [];
  attendeePick.value = "";
  editingId.value = null;
};

const handleAdd = () => {
  resetForm();
  showModal.value = true;
};

const handleEdit = (m: any) => {
  resetForm();
  form.title = m.title || "";
  form.type = m.type || "board";
  form.status = m.status || "scheduled";
  const p = parseDatetime(m.meeting_date);
  form.meeting_date_date = p.date;
  form.meeting_date_time = p.time;
  form.location = m.location || "";
  form.virtual_url = m.virtual_url || "";
  form.agenda = m.agenda || "";
  form.minutes = m.minutes || "";
  form.recording_url = m.recording_url || "";
  form.is_published = !!m.is_published;
  form.target_audience = m.target_audience || "all";
  formAttendees.value = (m.attendees || []).map((a: any) => ({
    id: a.id,
    hoa_member: typeof a.hoa_member === "object" ? a.hoa_member?.id : a.hoa_member,
    role_at_meeting: a.role_at_meeting || "",
    board_term: typeof a.board_term === "object" ? a.board_term?.id : a.board_term || null,
    is_board_member: !!a.is_board_member,
    attendance: a.attendance || "present",
  }));
  originalAttendeeIds.value = formAttendees.value.map((a) => a.id!).filter(Boolean);
  editingId.value = m.id;
  showModal.value = true;
};

// Anchor the AI assistant to the meeting being viewed/edited while the modal is
// open, so the assistant answers about THIS meeting (and keeps its own thread).
const { setContext: setAiFocus, clearContext: clearAiFocus } = useAiContext();
watch(showModal, (open) => {
  if (open && editingId.value) {
    setAiFocus({ entityType: "meeting", entityId: editingId.value, label: form.title || "Meeting" });
  } else {
    clearAiFocus();
  }
});

// Add an attendee, snapshotting their board role as of the meeting date
const addAttendee = () => {
  const memberId = attendeePick.value;
  if (!memberId) return;
  if (formAttendees.value.some((a) => a.hoa_member === memberId)) {
    toast.info("That person is already an attendee");
    return;
  }
  const term = activeTermFor(memberId, meetingDateISO.value || "");
  formAttendees.value.push({
    hoa_member: memberId,
    board_term: term?.id || null,
    role_at_meeting: term ? BOARD_TITLE_LABELS[term.title as string] || "Board Member" : "Attendee",
    is_board_member: !!term,
    attendance: "present",
  });
  attendeePick.value = "";
};

const removeAttendeeRow = (idx: number) => {
  formAttendees.value.splice(idx, 1);
};

const handleSubmit = async () => {
  if (!organization.value?.id) return toast.error("No organization selected");
  if (!form.title.trim()) return toast.error("Title is required");

  saving.value = true;
  try {
    const data = {
      title: form.title,
      type: form.type,
      status: form.status,
      meeting_date: meetingDateISO.value,
      location: form.location || null,
      virtual_url: form.virtual_url || null,
      agenda: form.agenda || null,
      minutes: form.minutes || null,
      recording_url: form.recording_url || null,
      is_published: form.is_published,
      target_audience: form.target_audience,
    };

    let meetingId = editingId.value;
    if (meetingId) {
      await updateMeeting(meetingId, data);
    } else {
      const created = await createMeeting({ ...data, organization: organization.value.id });
      meetingId = (created as any)?.id;
    }

    if (meetingId) {
      // Delete removed attendees
      const keptIds = formAttendees.value.map((a) => a.id).filter(Boolean) as string[];
      const toDelete = originalAttendeeIds.value.filter((id) => !keptIds.includes(id));
      for (const id of toDelete) await removeAttendee(id);
      // Create new attendees
      for (const a of formAttendees.value.filter((x) => !x.id)) {
        await createAttendee({
          meeting: meetingId,
          hoa_member: a.hoa_member,
          board_term: a.board_term,
          role_at_meeting: a.role_at_meeting,
          is_board_member: a.is_board_member,
          attendance: a.attendance,
        });
      }
    }

    toast.success(editingId.value ? "Meeting updated" : "Meeting created");
    await refreshMeetings();
    showModal.value = false;
    resetForm();
  } catch (e: any) {
    console.error("Save meeting error:", e);
    toast.error(e?.message || "Failed to save meeting");
  } finally {
    saving.value = false;
  }
};

const handleDelete = async (id: string) => {
  if (!confirm("Delete this meeting? This cannot be undone.")) return;
  try {
    await removeMeeting(id);
    toast.success("Meeting deleted");
    await refreshMeetings();
  } catch (e: any) {
    toast.error(e?.message || "Failed to delete meeting");
  }
};
</script>

<template>
  <div class="min-h-screen t-bg">
    <PageContainer class="space-y-6">
        <AppPageHeader
          :eyebrow="organization?.name"
          title="Meetings"
          description="Post notices, agendas, minutes & recordings for your community."
        >
          <template #actions>
            <Button @click="handleAdd">
              <Icon name="i-lucide-plus" class="size-4 mr-1.5" />
              New meeting
            </Button>
          </template>
        </AppPageHeader>

        <!-- Upcoming -->
        <section v-if="upcoming.length" class="space-y-3">
          <h2 class="type-micro t-text-secondary">Upcoming</h2>
          <div class="grid gap-3">
            <div v-for="m in upcoming" :key="m.id" class="stagger-item ios-card p-4">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <Icon :name="'i-lucide-' + typeInfo(m.type).icon" class="size-4 t-accent-app" />
                    <h3 class="font-semibold t-text truncate">{{ m.title }}</h3>
                    <span
                      v-if="!m.is_published"
                      class="rounded-full px-2 py-0.5 text-[10px] font-medium t-bg-subtle t-text-muted uppercase tracking-wide"
                    >Draft</span>
                  </div>
                  <p class="text-sm t-text-muted mt-1">
                    <Icon name="i-lucide-calendar" class="size-3.5 inline -mt-0.5 mr-1" />
                    {{ formatDateTime(m.meeting_date) }}
                    <span v-if="m.location"> · {{ m.location }}</span>
                  </p>
                  <p v-if="m.attendees?.length" class="text-xs t-text-muted mt-1">
                    {{ m.attendees.length }} attendee{{ m.attendees.length === 1 ? "" : "s" }}
                  </p>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" @click="handleEdit(m)">
                    <Icon name="i-lucide-pencil" class="size-4" />
                  </Button>
                  <Button variant="ghost" size="sm" @click="handleDelete(m.id)">
                    <Icon name="i-lucide-trash-2" class="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Past / all others -->
        <section v-if="past.length" class="space-y-3">
          <h2 class="type-micro t-text-secondary">Past &amp; other</h2>
          <div class="grid gap-3">
            <div v-for="m in past" :key="m.id" class="stagger-item ios-card p-4">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <Icon :name="'i-lucide-' + typeInfo(m.type).icon" class="size-4 t-text-muted" />
                    <h3 class="font-semibold t-text truncate">{{ m.title }}</h3>
                    <span
                      v-if="m.status === 'canceled'"
                      class="rounded-full px-2 py-0.5 text-[10px] font-medium bg-destructive/15 text-destructive uppercase tracking-wide"
                    >Canceled</span>
                    <span
                      v-if="!m.is_published"
                      class="rounded-full px-2 py-0.5 text-[10px] font-medium t-bg-subtle t-text-muted uppercase tracking-wide"
                    >Draft</span>
                  </div>
                  <p class="text-sm t-text-muted mt-1">
                    <Icon name="i-lucide-calendar" class="size-3.5 inline -mt-0.5 mr-1" />
                    {{ formatDateTime(m.meeting_date) }}
                  </p>
                  <div class="flex items-center gap-3 mt-1 text-xs t-text-muted">
                    <span v-if="m.minutes"><Icon name="i-lucide-file-text" class="size-3.5 inline -mt-0.5 mr-0.5" />Minutes</span>
                    <span v-if="m.recording_url"><Icon name="i-lucide-video" class="size-3.5 inline -mt-0.5 mr-0.5" />Recording</span>
                    <span v-if="m.attendees?.length">{{ m.attendees.length }} attended</span>
                  </div>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" @click="handleEdit(m)">
                    <Icon name="i-lucide-pencil" class="size-4" />
                  </Button>
                  <Button variant="ghost" size="sm" @click="handleDelete(m.id)">
                    <Icon name="i-lucide-trash-2" class="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Sibling of both sections, not a child of "Past & other" — otherwise
             a board with only upcoming meetings saw that heading with nothing
             under it. -->
        <div v-if="!upcoming.length && !past.length" class="ios-card">
          <AppEmptyState
            icon="lucide:calendar-off"
            title="No meetings yet"
            description="Post a notice with its agenda, then come back after to add minutes, a recording and who attended."
          >
            <Button @click="handleAdd">
              <Icon name="i-lucide-plus" class="size-4 mr-1.5" />
              Create your first meeting
            </Button>
          </AppEmptyState>
        </div>
      </PageContainer>

    <!-- Create / edit dialog -->
    <Dialog v-model:open="showModal">
      <DialogContent class="ui-kit max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{{ editingId ? "Edit meeting" : "New meeting" }}</DialogTitle>
          <DialogDescription>
            Notice, agenda, minutes, recording and attendees.
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4 py-2">
          <div>
            <label class="text-sm font-medium t-text">Title</label>
            <input
              v-model="form.title"
              type="text"
              placeholder="e.g. March Board Meeting"
              class="mt-1 w-full rounded-lg border t-border bg-transparent px-3 py-2 text-sm t-text"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-sm font-medium t-text">Type</label>
              <select v-model="form.type" class="mt-1 w-full rounded-lg border t-border bg-transparent px-3 py-2 text-sm t-text">
                <option v-for="o in TYPE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </div>
            <div>
              <label class="text-sm font-medium t-text">Status</label>
              <select v-model="form.status" class="mt-1 w-full rounded-lg border t-border bg-transparent px-3 py-2 text-sm t-text">
                <option v-for="o in STATUS_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-sm font-medium t-text">Date</label>
              <input v-model="form.meeting_date_date" type="date" class="mt-1 w-full rounded-lg border t-border bg-transparent px-3 py-2 text-sm t-text" />
            </div>
            <div>
              <label class="text-sm font-medium t-text">Time</label>
              <input v-model="form.meeting_date_time" type="time" class="mt-1 w-full rounded-lg border t-border bg-transparent px-3 py-2 text-sm t-text" />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-sm font-medium t-text">Location</label>
              <input v-model="form.location" type="text" placeholder="Clubhouse / Zoom" class="mt-1 w-full rounded-lg border t-border bg-transparent px-3 py-2 text-sm t-text" />
            </div>
            <div>
              <label class="text-sm font-medium t-text">Virtual URL</label>
              <input v-model="form.virtual_url" type="url" placeholder="https://" class="mt-1 w-full rounded-lg border t-border bg-transparent px-3 py-2 text-sm t-text" />
            </div>
          </div>

          <div>
            <label class="text-sm font-medium t-text">Agenda</label>
            <textarea v-model="form.agenda" rows="3" class="mt-1 w-full rounded-lg border t-border bg-transparent px-3 py-2 text-sm t-text" />
          </div>

          <div>
            <label class="text-sm font-medium t-text">Minutes</label>
            <textarea v-model="form.minutes" rows="3" class="mt-1 w-full rounded-lg border t-border bg-transparent px-3 py-2 text-sm t-text" />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-sm font-medium t-text">Recording URL</label>
              <input v-model="form.recording_url" type="url" placeholder="https://" class="mt-1 w-full rounded-lg border t-border bg-transparent px-3 py-2 text-sm t-text" />
            </div>
            <div>
              <label class="text-sm font-medium t-text">Audience</label>
              <select v-model="form.target_audience" class="mt-1 w-full rounded-lg border t-border bg-transparent px-3 py-2 text-sm t-text">
                <option v-for="o in AUDIENCE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </div>
          </div>

          <!-- Attendees -->
          <div class="rounded-lg border t-border p-3">
            <p class="text-sm font-medium t-text mb-2">Attendees</p>
            <p class="text-xs t-text-muted mb-2">
              Board roles are captured as of the meeting date and frozen for the record.
            </p>
            <div class="flex gap-2">
              <select v-model="attendeePick" class="flex-1 rounded-lg border t-border bg-transparent px-3 py-2 text-sm t-text">
                <option value="">Add a person…</option>
                <option v-for="mem in members || []" :key="mem.id" :value="mem.id">
                  {{ mem.first_name }} {{ mem.last_name }}
                </option>
              </select>
              <Button type="button" variant="outline" size="sm" @click="addAttendee">Add</Button>
            </div>
            <ul v-if="formAttendees.length" class="mt-3 space-y-2">
              <li v-for="(a, idx) in formAttendees" :key="a.hoa_member" class="flex items-center justify-between gap-2 text-sm">
                <span class="t-text">{{ memberName(a.hoa_member) }}</span>
                <span class="flex items-center gap-2">
                  <span v-if="a.is_board_member" class="rounded-full px-2 py-0.5 text-[10px] font-medium t-bg-accent/20 t-text-accent">
                    {{ a.role_at_meeting }}
                  </span>
                  <select v-model="a.attendance" class="rounded border t-border bg-transparent px-1.5 py-1 text-xs t-text">
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="excused">Excused</option>
                    <option value="proxy">Proxy</option>
                  </select>
                  <button type="button" class="t-text-muted hover:text-destructive" @click="removeAttendeeRow(idx)">
                    <Icon name="i-lucide-x" class="size-4" />
                  </button>
                </span>
              </li>
            </ul>
          </div>

          <label class="flex items-center gap-2 text-sm t-text">
            <input v-model="form.is_published" type="checkbox" class="rounded" />
            Published (visible to members)
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="showModal = false">Cancel</Button>
          <Button :disabled="saving" @click="handleSubmit">
            <span v-if="saving" class="spinner-ios spinner-ios--sm mr-1.5" />
            {{ editingId ? "Save changes" : "Create meeting" }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

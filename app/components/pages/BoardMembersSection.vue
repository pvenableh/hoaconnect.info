<script setup lang="ts">
interface BoardMemberTerm {
  id: string;
  title: string | null;
  term_start: string | null;
  term_end: string | null;
  icon: string | null;
  message: string | null;
  hoa_member: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

interface Props {
  boardMembers: BoardMemberTerm[];
  showEmail?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showEmail: false,
});

// Format title for display
function formatTitle(title: string | null): string {
  if (!title) return "Board Member";

  const displayNames: Record<string, string> = {
    president: "President",
    vice_president: "Vice President",
    secretary: "Secretary",
    treasurer: "Treasurer",
    director: "Director",
  };

  return displayNames[title] || title.replace(/_/g, " ");
}

// Get icon for title
function getTitleIcon(title: string | null): string {
  const icons: Record<string, string> = {
    president: "heroicons:star",
    vice_president: "heroicons:star",
    secretary: "heroicons:clipboard-document-list",
    treasurer: "heroicons:banknotes",
    director: "heroicons:user-circle",
  };

  return icons[title || ""] || "heroicons:user";
}

// Badge/avatar styling — the role is already spelled out in text + icon, so the
// chip carries no semantic color of its own; it wears the org's accent so the
// board roster matches whichever theme the org runs.
const TITLE_CHIP_CLASS = "t-bg-accent/20 t-text-accent";

// Format date for display
function formatTermDate(dateString: string | null): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  });
}

// Get member full name
function getMemberName(member: BoardMemberTerm["hoa_member"]): string {
  if (!member) return "Board Member";
  const parts = [member.first_name, member.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Board Member";
}

// Get member initials for avatar
function getMemberInitials(member: BoardMemberTerm["hoa_member"]): string {
  if (!member) return "BM";
  const first = member.first_name?.[0] || "";
  const last = member.last_name?.[0] || "";
  return (first + last).toUpperCase() || "BM";
}
</script>

<template>
  <div v-if="boardMembers.length > 0" class="space-y-6">
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div
        v-for="term in boardMembers"
        :key="term.id"
        class="t-card hover:t-shadow-lg transition-shadow overflow-hidden"
      >
        <!-- Card Header with Title Badge -->
        <div class="p-6">
          <div class="flex items-start gap-4">
            <!-- Avatar -->
            <div
              class="w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold flex-shrink-0"
              :class="TITLE_CHIP_CLASS"
            >
              {{ getMemberInitials(term.hoa_member) }}
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <h3 class="text-lg font-semibold t-text truncate">
                {{ getMemberName(term.hoa_member) }}
              </h3>

              <!-- Title Badge -->
              <span
                class="inline-flex items-center gap-1.5 px-2.5 py-1 text-sm font-medium rounded-full mt-2"
                :class="TITLE_CHIP_CLASS"
              >
                <Icon :name="getTitleIcon(term.title)" class="w-4 h-4" />
                {{ formatTitle(term.title) }}
              </span>

              <!-- Term Dates -->
              <p
                v-if="term.term_start || term.term_end"
                class="text-sm t-text-muted mt-2"
              >
                <span v-if="term.term_start">{{ formatTermDate(term.term_start) }}</span>
                <span v-if="term.term_start && term.term_end"> - </span>
                <span v-if="term.term_end">{{ formatTermDate(term.term_end) }}</span>
                <span v-if="term.term_start && !term.term_end"> - Present</span>
              </p>

              <!-- Email (optional) -->
              <a
                v-if="showEmail && term.hoa_member?.email"
                :href="`mailto:${term.hoa_member.email}`"
                class="text-sm t-text-accent hover:underline mt-1 block truncate"
              >
                {{ term.hoa_member.email }}
              </a>
            </div>
          </div>

          <!-- Message/Bio -->
          <p
            v-if="term.message"
            class="t-text-secondary mt-4 text-sm leading-relaxed"
          >
            {{ term.message }}
          </p>
        </div>
      </div>
    </div>
  </div>

  <!-- Empty State -->
  <div v-else class="text-center py-12">
    <div class="w-16 h-16 rounded-full t-bg-subtle flex items-center justify-center mx-auto mb-4">
      <Icon name="heroicons:user-group" class="h-8 w-8 t-text-muted" />
    </div>
    <h3 class="text-lg font-medium t-text mb-2">No Board Members Listed</h3>
    <p class="t-text-muted">
      Board member information will appear here once it's available.
    </p>
  </div>
</template>

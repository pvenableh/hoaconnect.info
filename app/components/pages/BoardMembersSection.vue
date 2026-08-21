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

// Get background color class for title
// Board titles are CATEGORICAL colour — the hue distinguishes one office from
// another and carries no status meaning, so these stay arbitrary rather than
// moving onto the status tokens. They do need a dark pair, though: these were
// light-only, which put dark ink on a near-white chip in dark mode.
function getTitleColorClass(title: string | null): string {
  const colors: Record<string, string> = {
    president: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
    vice_president: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200",
    secretary: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
    treasurer: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-200",
    director: "t-bg-subtle t-text-secondary",
  };

  return colors[title || ""] || "t-bg-subtle t-text-secondary";
}

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
        class="ios-card overflow-hidden"
      >
        <!-- Card Header with Title Badge -->
        <div class="p-6">
          <div class="flex items-start gap-4">
            <!-- Avatar -->
            <div
              class="w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold flex-shrink-0"
              :class="getTitleColorClass(term.title)"
            >
              {{ getMemberInitials(term.hoa_member) }}
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <h3 class="type-card t-text truncate">
                {{ getMemberName(term.hoa_member) }}
              </h3>

              <!-- Title Badge -->
              <span
                class="inline-flex items-center gap-1.5 px-2.5 py-1 text-sm font-medium rounded-full mt-2"
                :class="getTitleColorClass(term.title)"
              >
                <Icon :name="getTitleIcon(term.title)" class="w-4 h-4" />
                {{ formatTitle(term.title) }}
              </span>

              <!-- Term Dates -->
              <p
                v-if="term.term_start || term.term_end"
                class="type-meta t-text-muted mt-2"
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
                class="type-meta t-text-accent hover:underline mt-1 block truncate"
              >
                {{ term.hoa_member.email }}
              </a>
            </div>
          </div>

          <!-- Message/Bio -->
          <p
            v-if="term.message"
            class="type-body t-text-secondary mt-4"
          >
            {{ term.message }}
          </p>
        </div>
      </div>
    </div>
  </div>

  <!-- Empty State -->
  <AppEmptyState
    v-else
    icon="lucide:users-round"
    title="No board members listed"
    description="Once your community records who holds each office, they appear here with their term."
  />
</template>

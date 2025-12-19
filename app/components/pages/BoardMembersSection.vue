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
function getTitleColorClass(title: string | null): string {
  const colors: Record<string, string> = {
    president: "bg-amber-100 text-amber-700",
    vice_president: "bg-blue-100 text-blue-700",
    secretary: "bg-emerald-100 text-emerald-700",
    treasurer: "bg-purple-100 text-purple-700",
    director: "bg-stone-100 text-stone-700",
  };

  return colors[title || ""] || "bg-stone-100 text-stone-700";
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
        class="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow overflow-hidden"
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
              <h3 class="text-lg font-semibold text-stone-900 truncate">
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
                class="text-sm text-stone-500 mt-2"
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
                class="text-sm text-primary hover:underline mt-1 block truncate"
              >
                {{ term.hoa_member.email }}
              </a>
            </div>
          </div>

          <!-- Message/Bio -->
          <p
            v-if="term.message"
            class="text-stone-600 mt-4 text-sm leading-relaxed"
          >
            {{ term.message }}
          </p>
        </div>
      </div>
    </div>
  </div>

  <!-- Empty State -->
  <div v-else class="text-center py-12">
    <div class="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4">
      <Icon name="heroicons:user-group" class="h-8 w-8 text-stone-400" />
    </div>
    <h3 class="text-lg font-medium text-stone-900 mb-2">No Board Members Listed</h3>
    <p class="text-stone-500">
      Board member information will appear here once it's available.
    </p>
  </div>
</template>

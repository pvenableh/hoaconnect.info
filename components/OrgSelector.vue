<script setup lang="ts">
const { currentOrg, memberships, setOrganization, hasMultipleOrgs } =
  useSelectedOrg();

const showDropdown = ref(false);

const handleSelect = (orgId: string) => {
  setOrganization(orgId);
  showDropdown.value = false;
  // Reload the page to refresh all data
  window.location.reload();
};
</script>

<template>
  <div v-if="hasMultipleOrgs" class="relative">
    <button
      @click="showDropdown = !showDropdown"
      class="flex items-center gap-2 px-3 py-2 text-sm border rounded hover:bg-stone-50 transition-colors"
    >
      <span>🏢</span>
      <span class="font-medium">{{
        currentOrg?.organization?.name || "Select HOA"
      }}</span>
      <span class="text-xs">▼</span>
    </button>

    <!-- Dropdown -->
    <div
      v-if="showDropdown"
      class="absolute top-full left-0 mt-2 w-64 bg-white border rounded-lg shadow-lg z-50"
    >
      <div class="p-2">
        <p class="text-xs text-stone-500 px-2 py-1 mb-1">Switch Organization</p>
        <button
          v-for="membership in memberships"
          :key="membership.id"
          @click="handleSelect(membership.organization.id)"
          class="w-full text-left px-3 py-2 rounded hover:bg-stone-100 transition-colors"
          :class="{
            'bg-stone-100':
              membership.organization.id === currentOrg?.organization?.id,
          }"
        >
          <p class="font-medium">{{ membership.organization.name }}</p>
          <p class="text-xs text-stone-500">
            {{ membership.role?.name || "Guest" }}
          </p>
        </button>
      </div>
    </div>

    <!-- Click outside to close -->
    <div
      v-if="showDropdown"
      @click="showDropdown = false"
      class="fixed inset-0 z-40"
    />
  </div>
</template>

<script setup lang="ts">
const { data: diagnostics, pending, error, refresh } = await useFetch("/api/debug/permissions");

const hasIssues = computed(() => {
  if (!diagnostics.value) return false;
  const analysis = diagnostics.value.analysis;
  return !analysis.canCreateUnits || !analysis.canReadUnits;
});
</script>

<template>
  <div v-if="hasIssues || error" class="p-4 border-2 rounded-lg" :class="error ? 'bg-red-50 border-red-400' : 'bg-yellow-50 border-yellow-400'">
    <h3 class="font-bold text-lg mb-4 flex items-center gap-2">
      <span>⚠️</span>
      <span>Permissions Diagnostic</span>
    </h3>

    <div v-if="pending" class="text-sm">
      Loading permissions information...
    </div>

    <div v-else-if="error" class="space-y-2 text-sm">
      <p class="text-red-600 font-semibold">Error loading permissions:</p>
      <pre class="mt-2 p-2 bg-white rounded overflow-auto">{{ error }}</pre>
    </div>

    <div v-else-if="diagnostics" class="space-y-4 text-sm">
      <div>
        <strong>User:</strong> {{ diagnostics.user.email }}
      </div>

      <div>
        <strong>Role:</strong> {{ diagnostics.role?.name || 'Unknown' }}
        <span v-if="diagnostics.role?.admin_access" class="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Admin</span>
      </div>

      <div class="space-y-2">
        <strong>Units Permissions:</strong>
        <div class="grid grid-cols-2 gap-2 mt-2">
          <div class="flex items-center gap-2">
            <span :class="diagnostics.analysis.canCreateUnits ? 'text-green-600' : 'text-red-600'">
              {{ diagnostics.analysis.canCreateUnits ? '✅' : '❌' }}
            </span>
            <span>Create Units</span>
          </div>
          <div class="flex items-center gap-2">
            <span :class="diagnostics.analysis.canReadUnits ? 'text-green-600' : 'text-red-600'">
              {{ diagnostics.analysis.canReadUnits ? '✅' : '❌' }}
            </span>
            <span>Read Units</span>
          </div>
          <div class="flex items-center gap-2">
            <span :class="diagnostics.analysis.canUpdateUnits ? 'text-green-600' : 'text-red-600'">
              {{ diagnostics.analysis.canUpdateUnits ? '✅' : '❌' }}
            </span>
            <span>Update Units</span>
          </div>
          <div class="flex items-center gap-2">
            <span :class="diagnostics.analysis.canDeleteUnits ? 'text-green-600' : 'text-red-600'">
              {{ diagnostics.analysis.canDeleteUnits ? '✅' : '❌' }}
            </span>
            <span>Delete Units</span>
          </div>
        </div>
      </div>

      <div v-if="hasIssues" class="p-3 bg-white rounded border border-yellow-600">
        <p class="font-semibold text-yellow-800 mb-2">⚠️ Permission Issues Detected</p>
        <p class="text-xs mb-2">Your role does not have the necessary permissions to manage units.</p>
        <p class="text-xs mb-3">To fix this issue, run the following command:</p>
        <pre class="p-2 bg-gray-100 rounded text-xs overflow-x-auto">npx tsx scripts/fix-permissions.ts</pre>
        <p class="text-xs mt-2 text-gray-600">
          This will configure the proper permissions in Directus for your role.
        </p>
      </div>

      <button
        @click="refresh"
        class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
      >
        Refresh Permissions
      </button>
    </div>
  </div>
</template>

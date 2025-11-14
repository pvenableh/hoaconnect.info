<script setup lang="ts">
import { useDirectusAuth, useDirectusItems } from "#imports";

const { user } = useDirectusAuth();
const { fetchItems } = useDirectusItems();

const debugData = ref({
  user: null as any,
  fullUser: null as any,
  memberships: null as any,
  error: null as any,
  rawResponse: null as any,
  fullQueryResult: null as any,
});

const checkData = async () => {
  try {
    console.log("=== DEBUG: Starting check ===");
    console.log("User object:", user.value);

    // Store the full user object to see all fields
    debugData.value.fullUser = user.value;

    debugData.value.user = {
      id: user.value?.id,
      email: user.value?.email,
      first_name: user.value?.first_name,
      last_name: user.value?.last_name,
      firstName: user.value?.firstName,
      lastName: user.value?.lastName,
    };

    if (!user.value?.id) {
      debugData.value.error = "No user ID found";
      return;
    }

    // Try the simplest query first
    console.log("Fetching hoa_members with user ID:", user.value.id);

    const result = await fetchItems("hoa_members", {
      fields: ["id", "user", "organization"],
      filter: {
        user: { _eq: user.value.id },
      },
    });

    console.log("Raw result:", result);
    debugData.value.rawResponse = result;
    debugData.value.memberships = result.data.value;

    // Now try the full query
    const fullResult = await fetchItems("hoa_members", {
      fields: [
        "id",
        "organization.id",
        "organization.name",
        "role.id",
        "role.name",
      ],
      filter: {
        user: { _eq: user.value.id },
      },
    });

    console.log("Full query result:", fullResult);
    debugData.value.fullQueryResult = fullResult.data.value;
  } catch (err: any) {
    console.error("Error:", err);
    debugData.value.error = err.message || err.toString();
  }
};

onMounted(() => {
  checkData();
});
</script>

<template>
  <div class="p-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg">
    <h3 class="font-bold text-lg mb-4">🐛 Debug Information</h3>

    <div class="space-y-4 text-sm">
      <div>
        <strong>Full User Object (from useDirectusAuth):</strong>
        <pre class="mt-2 p-2 bg-white rounded overflow-auto max-h-60">{{
          JSON.stringify(debugData.fullUser, null, 2)
        }}</pre>
      </div>

      <div>
        <strong>User Data (extracted fields):</strong>
        <pre class="mt-2 p-2 bg-white rounded overflow-auto">{{
          JSON.stringify(debugData.user, null, 2)
        }}</pre>
      </div>

      <div>
        <strong>Memberships (Simple Query - id, user, organization):</strong>
        <pre class="mt-2 p-2 bg-white rounded overflow-auto">{{
          JSON.stringify(debugData.memberships, null, 2)
        }}</pre>
      </div>

      <div>
        <strong>Full Query Result (with nested relations):</strong>
        <pre class="mt-2 p-2 bg-white rounded overflow-auto max-h-60">{{
          JSON.stringify(debugData.fullQueryResult, null, 2)
        }}</pre>
      </div>

      <div>
        <strong>Raw Response:</strong>
        <pre class="mt-2 p-2 bg-white rounded overflow-auto max-h-40">{{
          JSON.stringify(debugData.rawResponse, null, 2)
        }}</pre>
      </div>

      <div v-if="debugData.error" class="text-red-600">
        <strong>Error:</strong>
        <pre class="mt-2 p-2 bg-white rounded">{{ debugData.error }}</pre>
      </div>

      <button
        @click="checkData"
        class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Refresh Debug Data
      </button>
    </div>
  </div>
</template>

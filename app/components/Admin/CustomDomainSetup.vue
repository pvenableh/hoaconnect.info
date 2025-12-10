<template>
  <div class="max-w-4xl mx-auto p-6">
    <!-- No Organization Selected State -->
    <div
      v-if="!hoaId"
      class="flex flex-col items-center justify-center py-12 px-4"
    >
      <div
        class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4"
      >
        <svg
          class="w-8 h-8 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
        </svg>
      </div>
      <h2 class="text-xl font-semibold text-gray-900 mb-2">
        No Organization Selected
      </h2>
      <p class="text-gray-600 text-center max-w-md">
        Please select an organization to configure custom domain settings.
      </p>
    </div>

    <div v-else>
      <h1 class="text-3xl font-bold mb-2">Custom Domain Setup</h1>
      <p class="text-gray-600 mb-8">
        Configure a custom domain for your organization's portal
      </p>

      <!-- Current Status Card -->
      <Card class="mb-6">
        <CardHeader>
          <CardTitle>Current Portal Access</CardTitle>
          <CardDescription>How members access your portal</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="space-y-4">
            <!-- Slug-based URL (always available) -->
            <div
              class="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3"
            >
              <div
                class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0"
              >
                <svg
                  class="w-5 h-5 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-semibold">Default URL</span>
                  <span
                    class="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full"
                    >Active</span
                  >
                </div>
                <a
                  v-if="organizationSlug"
                  :href="`https://${config.public.mainDomain}/${organizationSlug}`"
                  target="_blank"
                  class="text-blue-600 hover:underline font-mono text-sm"
                >
                  {{ config.public.mainDomain }}/{{ organizationSlug }}
                </a>
                <p class="text-gray-600 text-sm mt-2">
                  Your default portal URL - always available even if you set up
                  a custom domain
                </p>
              </div>
            </div>

            <!-- Custom Domain (if configured) -->
            <div
              v-if="organizationData?.custom_domain"
              class="p-4 border rounded-lg flex items-start gap-3"
              :class="
                organizationData.domain_verified
                  ? 'bg-green-50 border-green-200'
                  : 'bg-yellow-50 border-yellow-200'
              "
            >
              <div
                class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                :class="
                  organizationData.domain_verified
                    ? 'bg-green-100'
                    : 'bg-yellow-100'
                "
              >
                <svg
                  v-if="organizationData.domain_verified"
                  class="w-5 h-5 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <svg
                  v-else
                  class="w-5 h-5 text-yellow-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-semibold">Custom Domain</span>
                  <span
                    class="px-2 py-0.5 text-xs rounded-full"
                    :class="
                      organizationData.domain_verified
                        ? 'bg-green-600 text-white'
                        : 'bg-yellow-600 text-white'
                    "
                  >
                    {{
                      organizationData.domain_verified
                        ? "Verified"
                        : "Pending Verification"
                    }}
                  </span>
                </div>
                <a
                  :href="`https://${organizationData.custom_domain}`"
                  target="_blank"
                  class="font-mono text-sm hover:underline"
                  :class="
                    organizationData.domain_verified
                      ? 'text-green-700'
                      : 'text-yellow-700'
                  "
                >
                  {{ organizationData.custom_domain }}
                </a>
                <p
                  v-if="!organizationData.domain_verified"
                  class="text-gray-600 text-sm mt-2"
                >
                  Complete DNS setup below to verify and activate this domain
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Add/Configure Custom Domain -->
      <Card v-if="!organizationData?.custom_domain" class="mb-6">
        <CardHeader>
          <CardTitle>Add Custom Domain</CardTitle>
          <CardDescription>
            Use your own domain name for a professional branded experience
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form @submit.prevent="handleAddDomain" class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-2">
                Domain Name
                <span class="text-gray-500 font-normal ml-1"
                  >(e.g., myhoasite.com or portal.myhoa.com)</span
                >
              </label>
              <input
                v-model="newDomain"
                type="text"
                placeholder="yourdomain.com"
                class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p class="text-sm text-gray-500 mt-2">
                You can use an apex domain (yourdomain.com) or a subdomain
                (portal.yourdomain.com)
              </p>
            </div>

            <Button
              type="submit"
              :disabled="isAdding || !newDomain"
              class="w-full"
            >
              <span v-if="isAdding">Adding Domain...</span>
              <span v-else>Add Domain</span>
            </Button>

            <div
              v-if="addError"
              class="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"
            >
              {{ addError }}
            </div>
          </form>
        </CardContent>
      </Card>

      <!-- DNS Configuration Instructions -->
      <Card
        v-if="
          organizationData?.custom_domain && !organizationData?.domain_verified
        "
      >
        <CardHeader>
          <CardTitle>DNS Configuration</CardTitle>
          <CardDescription>
            Add these DNS records to your domain registrar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div class="space-y-4">
            <!-- Instructions -->
            <div class="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 class="font-semibold mb-2 flex items-center gap-2">
                <svg
                  class="w-5 h-5 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Setup Instructions
              </h4>
              <ol
                class="list-decimal list-inside space-y-2 text-sm text-gray-700"
              >
                <li>
                  Log in to your domain registrar (e.g., GoDaddy, Namecheap,
                  Cloudflare)
                </li>
                <li>Navigate to DNS settings or DNS management</li>
                <li>
                  Add <strong>ALL</strong> the DNS records shown below exactly
                  as specified (this includes both the apex domain and www
                  subdomain records if shown)
                </li>
                <li>
                  Save changes (DNS propagation can take up to 48 hours, but is
                  usually faster)
                </li>
                <li>
                  Return here and click "Verify Domain" to check the status
                </li>
              </ol>
            </div>

            <!-- DNS Records -->
            <div
              v-if="dnsInstructions"
              class="border rounded-lg overflow-hidden"
            >
              <div class="bg-gray-50 px-4 py-3 border-b">
                <h4 class="font-semibold">DNS Records to Add</h4>
              </div>
              <div class="p-4 space-y-4">
                <!-- A/AAAA Records (for apex domains) -->
                <div v-if="dnsInstructions.primary" class="space-y-3">
                  <div class="text-sm font-semibold text-gray-700 mb-2">
                    Apex Domain Records ({{ organizationData.custom_domain }})
                  </div>
                  <div
                    v-for="(record, index) in dnsInstructions.primary"
                    :key="index"
                    class="p-3 bg-gray-50 rounded-lg font-mono text-sm"
                  >
                    <div class="grid grid-cols-3 gap-4">
                      <div>
                        <span class="text-gray-500 block mb-1">Type</span>
                        <span class="font-semibold">{{ record.type }}</span>
                      </div>
                      <div>
                        <span class="text-gray-500 block mb-1">Name</span>
                        <span class="font-semibold">{{ record.name }}</span>
                      </div>
                      <div>
                        <span class="text-gray-500 block mb-1">Value</span>
                        <span class="font-semibold break-all">{{
                          record.value
                        }}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- WWW Subdomain Records (for apex domains) -->
                <div v-if="dnsInstructions.www" class="space-y-3">
                  <div class="text-sm font-semibold text-gray-700 mb-2">
                    WWW Subdomain Records (www.{{
                      organizationData.custom_domain
                    }})
                  </div>
                  <div
                    v-for="(record, index) in dnsInstructions.www"
                    :key="index"
                    class="p-3 bg-gray-50 rounded-lg font-mono text-sm"
                  >
                    <div class="grid grid-cols-3 gap-4">
                      <div>
                        <span class="text-gray-500 block mb-1">Type</span>
                        <span class="font-semibold">{{ record.type }}</span>
                      </div>
                      <div>
                        <span class="text-gray-500 block mb-1">Name</span>
                        <span class="font-semibold">{{ record.name }}</span>
                      </div>
                      <div>
                        <span class="text-gray-500 block mb-1">Value</span>
                        <span class="font-semibold break-all">{{
                          record.value
                        }}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- CNAME Records (for subdomains) -->
                <div v-if="dnsInstructions.records" class="space-y-3">
                  <div
                    v-for="(record, index) in dnsInstructions.records"
                    :key="index"
                    class="p-3 bg-gray-50 rounded-lg font-mono text-sm"
                  >
                    <div class="grid grid-cols-3 gap-4">
                      <div>
                        <span class="text-gray-500 block mb-1">Type</span>
                        <span class="font-semibold">{{ record.type }}</span>
                      </div>
                      <div>
                        <span class="text-gray-500 block mb-1">Name</span>
                        <span class="font-semibold">{{ record.name }}</span>
                      </div>
                      <div>
                        <span class="text-gray-500 block mb-1">Value</span>
                        <span class="font-semibold break-all">{{
                          record.value
                        }}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Alternative CNAME (if applicable) -->
                <div
                  v-if="dnsInstructions.alternative"
                  class="p-3 bg-yellow-50 border border-yellow-200 rounded-lg"
                >
                  <p class="text-sm text-yellow-800 mb-2">
                    <strong>Alternative:</strong>
                    {{ dnsInstructions.alternative.note }}
                  </p>
                  <div class="font-mono text-sm">
                    <div class="grid grid-cols-3 gap-4">
                      <div>
                        <span class="text-gray-500 block mb-1">Type</span>
                        <span class="font-semibold">{{
                          dnsInstructions.alternative.type
                        }}</span>
                      </div>
                      <div>
                        <span class="text-gray-500 block mb-1">Name</span>
                        <span class="font-semibold">{{
                          dnsInstructions.alternative.name
                        }}</span>
                      </div>
                      <div>
                        <span class="text-gray-500 block mb-1">Value</span>
                        <span class="font-semibold break-all">{{
                          dnsInstructions.alternative.value
                        }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Verify Button -->
            <Button
              @click="handleVerifyDomain"
              :disabled="isVerifying"
              class="w-full"
            >
              <span v-if="isVerifying">Verifying...</span>
              <span v-else>Verify Domain</span>
            </Button>

            <div
              v-if="verifyError"
              class="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"
            >
              {{ verifyError }}
            </div>
            <div
              v-if="verifySuccess"
              class="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm"
            >
              {{ verifySuccess }}
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Domain Successfully Verified -->
      <Card
        v-if="
          organizationData?.custom_domain && organizationData?.domain_verified
        "
      >
        <CardContent class="pt-6">
          <div class="text-center py-8">
            <div
              class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <svg
                class="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 class="text-2xl font-bold text-gray-900 mb-2">
              Domain Verified!
            </h3>
            <p class="text-gray-600 mb-6">
              Your custom domain is active and ready to use
            </p>
            <a
              :href="`https://${organizationData.custom_domain}`"
              target="_blank"
              class="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Visit Your Portal
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AddDomainResponse } from "~/types/domains";

const props = defineProps<{
  hoaId: string | null;
}>();

const config = useRuntimeConfig();

const newDomain = ref("");
const isAdding = ref(false);
const isVerifying = ref(false);
const addError = ref("");
const verifyError = ref("");
const verifySuccess = ref("");

// Fetch organization data reactively based on hoaId
const { data: organization, refresh: refreshOrganization } = await useAsyncData(
  `organization-${props.hoaId}`,
  async () => {
    if (!props.hoaId) {
      return null;
    }

    const { list } = useDirectusItems("hoa_organizations");
    const items = await list({
      filter: { id: { _eq: props.hoaId } },
      fields: [
        "id",
        "name",
        "slug",
        "custom_domain",
        "domain_verified",
        "domain_type",
        "domain_config",
      ],
      limit: 1,
    });

    return items && items.length > 0 ? items[0] : null;
  },
  {
    watch: [() => props.hoaId],
    server: false, // Fetch client-side only to ensure auth session is available
  }
);

const organizationData = computed(() => organization.value);

const organizationSlug = computed(() => organizationData.value?.slug);

const dnsInstructions = computed(() => {
  return organizationData.value?.domain_config?.dns_instructions || null;
});

// Add custom domain
const handleAddDomain = async () => {
  isAdding.value = true;
  addError.value = "";

  try {
    const response = await $fetch<AddDomainResponse>("/api/vercel/add-domain", {
      method: "POST",
      body: {
        domain: newDomain.value.toLowerCase().trim(),
        hoaId: props.hoaId,
      },
    });

    if (response.success) {
      await refreshOrganization();
      newDomain.value = "";
    }
  } catch (error: any) {
    addError.value =
      error.data?.message || error.message || "Failed to add domain";
  } finally {
    isAdding.value = false;
  }
};

// Verify domain
const handleVerifyDomain = async () => {
  isVerifying.value = true;
  verifyError.value = "";
  verifySuccess.value = "";

  try {
    const response = await $fetch("/api/vercel/verify-domain", {
      method: "POST",
      body: {
        domain: organizationData.value?.custom_domain,
        hoaId: props.hoaId,
      },
    });

    if (response.verified) {
      verifySuccess.value = "Domain verified successfully!";
      await refreshOrganization();
    } else {
      verifyError.value =
        "Domain not yet verified. Please ensure DNS records are configured correctly and try again in a few minutes.";
    }
  } catch (error: any) {
    verifyError.value =
      error.data?.message || error.message || "Failed to verify domain";
  } finally {
    isVerifying.value = false;
  }
};
</script>

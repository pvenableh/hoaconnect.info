<script setup lang="ts">
import { toast } from "vue-sonner";

definePageMeta({
  middleware: ["auth"],
  layout: "auth",
});

const route = useRoute();
const router = useRouter();
const config = useRuntimeConfig();

// Get slug from route params
const slug = computed(() => route.params.slug as string);

// Form state
const isSubmitting = ref(false);
const submitted = ref(false);
const form = reactive({
  unitNumber: "",
  memberType: "owner" as "owner" | "tenant" | "property_manager",
  message: "",
});

// Fetch organization by slug
const { data: organization, pending, error } = await useAsyncData(
  `join-request-org-${slug.value}`,
  async () => {
    const response = await $fetch(`/api/hoa/find?slug=${slug.value}`);
    return response;
  }
);

// Check if user already has a pending request or is a member
const { data: existingStatus, refresh: refreshStatus } = await useAsyncData(
  `join-request-status-${slug.value}`,
  async () => {
    if (!organization.value?.id) return null;
    try {
      const response = await $fetch("/api/hoa/check-membership", {
        method: "POST",
        body: { organizationId: organization.value.id },
      });
      return response;
    } catch {
      return null;
    }
  },
  {
    watch: [organization],
  }
);

// Helper function to get Directus file URL
const getFileUrl = (file: any) => {
  if (!file) return "";
  const fileId = typeof file === "object" ? file.id : file;
  return `${config.public.directus.url}/assets/${fileId}`;
};

const memberTypeOptions = [
  { value: "owner", label: "Owner", description: "I own a unit/property" },
  { value: "tenant", label: "Tenant", description: "I am renting a unit" },
  { value: "property_manager", label: "Property Manager", description: "I manage properties for owners" },
];

const handleSubmit = async () => {
  if (!organization.value?.id) return;

  isSubmitting.value = true;
  try {
    await $fetch("/api/hoa/request-join", {
      method: "POST",
      body: {
        organizationId: organization.value.id,
        unitNumber: form.unitNumber || null,
        memberType: form.memberType,
        message: form.message || null,
      },
    });

    submitted.value = true;
    toast.success("Request submitted!", {
      description: "An administrator will review your request.",
    });
  } catch (error: any) {
    toast.error("Failed to submit request", {
      description: error?.data?.message || error?.message || "Please try again.",
    });
  } finally {
    isSubmitting.value = false;
  }
};

// Set SEO meta
useSeoMeta({
  title: () =>
    organization.value
      ? `Request to Join - ${organization.value.name}`
      : "Request to Join",
  description: () =>
    organization.value
      ? `Request to join ${organization.value.name}`
      : "Request to join an HOA",
});
</script>

<template>
  <div class="min-h-screen t-bg">
    <div class="container mx-auto px-6 py-12">
      <div class="max-w-lg mx-auto">
        <!-- Loading State -->
        <div v-if="pending" class="text-center py-12">
          <Icon
            name="lucide:loader-2"
            class="w-8 h-8 animate-spin mx-auto mb-4"
          />
          <p class="text-sm t-text-secondary">Loading...</p>
        </div>

        <!-- Organization Not Found -->
        <div v-else-if="!organization" class="text-center py-12">
          <Icon
            name="lucide:building-2"
            class="w-16 h-16 mx-auto mb-4 t-text-muted"
          />
          <h1 class="text-2xl font-bold mb-2">Organization Not Found</h1>
          <p class="t-text-secondary mb-6">
            The organization you're looking for doesn't exist.
          </p>
          <Button @click="router.push('/')" variant="outline">
            Go Home
          </Button>
        </div>

        <!-- Already a member -->
        <div v-else-if="existingStatus?.isMember" class="text-center py-12">
          <Icon
            name="lucide:check-circle"
            class="w-16 h-16 mx-auto mb-4 text-green-500"
          />
          <h1 class="text-2xl font-bold mb-2">You're Already a Member</h1>
          <p class="t-text-secondary mb-6">
            You are already a member of {{ organization.name }}.
          </p>
          <Button @click="router.push(`/${slug}/documents`)">
            Go to Dashboard
          </Button>
        </div>

        <!-- Already has pending request -->
        <div v-else-if="existingStatus?.hasPendingRequest" class="text-center py-12">
          <Icon
            name="lucide:clock"
            class="w-16 h-16 mx-auto mb-4 text-amber-500"
          />
          <h1 class="text-2xl font-bold mb-2">Request Pending</h1>
          <p class="t-text-secondary mb-6">
            You already have a pending request to join {{ organization.name }}.
            An administrator will review your request.
          </p>
          <Button @click="router.push('/')" variant="outline">
            Go Home
          </Button>
        </div>

        <!-- Success State -->
        <div v-else-if="submitted" class="text-center py-12">
          <Icon
            name="lucide:mail-check"
            class="w-16 h-16 mx-auto mb-4 text-green-500"
          />
          <h1 class="text-2xl font-bold mb-2">Request Submitted</h1>
          <p class="t-text-secondary mb-6">
            Your request to join {{ organization.name }} has been submitted.
            An administrator will review your request and you'll be notified
            once it's approved.
          </p>
          <Button @click="router.push('/')" variant="outline">
            Go Home
          </Button>
        </div>

        <!-- Request Form -->
        <div v-else>
          <!-- Header -->
          <div class="text-center mb-8">
            <!-- Organization Logo -->
            <div v-if="organization?.logo" class="mb-4">
              <img
                :src="getFileUrl(organization.logo)"
                :alt="organization.name"
                class="h-16 mx-auto object-contain"
              />
            </div>
            <h1 class="text-2xl font-bold mb-2">Request to Join</h1>
            <p class="t-text-secondary">
              {{ organization.name }}
            </p>
          </div>

          <!-- Form -->
          <Card>
            <CardHeader>
              <CardTitle>Membership Request</CardTitle>
              <CardDescription>
                Fill out this form to request membership. An administrator will
                review your request.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form @submit.prevent="handleSubmit" class="space-y-6">
                <!-- Member Type -->
                <div class="space-y-3">
                  <Label>I am a</Label>
                  <div class="grid gap-3">
                    <label
                      v-for="option in memberTypeOptions"
                      :key="option.value"
                      class="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:t-bg-subtle transition-colors"
                      :class="{
                        'border-primary bg-primary/5': form.memberType === option.value,
                      }"
                    >
                      <input
                        type="radio"
                        :value="option.value"
                        v-model="form.memberType"
                        class="mt-1"
                      />
                      <div>
                        <p class="font-medium">{{ option.label }}</p>
                        <p class="text-sm t-text-secondary">{{ option.description }}</p>
                      </div>
                    </label>
                  </div>
                </div>

                <!-- Unit Number -->
                <div class="space-y-2">
                  <Label for="unit-number">Unit Number (Optional)</Label>
                  <Input
                    id="unit-number"
                    v-model="form.unitNumber"
                    placeholder="e.g., 101, A-5, etc."
                  />
                  <p class="text-xs t-text-muted">
                    If you know your unit number, enter it here
                  </p>
                </div>

                <!-- Message -->
                <div class="space-y-2">
                  <Label for="message">Additional Information (Optional)</Label>
                  <Textarea
                    id="message"
                    v-model="form.message"
                    placeholder="Any additional information you'd like to share..."
                    rows="3"
                  />
                </div>

                <!-- Submit -->
                <Button
                  type="submit"
                  class="w-full"
                  :disabled="isSubmitting"
                >
                  <Icon
                    v-if="isSubmitting"
                    name="lucide:loader-2"
                    class="w-4 h-4 mr-2 animate-spin"
                  />
                  {{ isSubmitting ? "Submitting..." : "Submit Request" }}
                </Button>
              </form>
            </CardContent>
          </Card>

          <!-- Back Link -->
          <div class="text-center mt-6">
            <NuxtLink
              :to="`/${slug}`"
              class="text-sm t-text-secondary hover:t-text transition-colors"
            >
              &larr; Back to {{ organization.name }}
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

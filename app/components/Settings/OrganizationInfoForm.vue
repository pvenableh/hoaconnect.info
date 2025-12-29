<template>
  <Card>
    <CardHeader>
      <CardTitle>Organization Information</CardTitle>
      <CardDescription>
        Basic details about your HOA organization
      </CardDescription>
    </CardHeader>
    <CardContent>
      <form @submit.prevent="saveChanges" class="space-y-4">
        <!-- Maintenance Mode Toggle -->
        <div class="flex items-center justify-between p-4 rounded-lg border bg-amber-50/50 border-amber-200">
          <div class="space-y-0.5">
            <Label class="text-base font-medium">Maintenance Mode</Label>
            <p class="text-sm text-muted-foreground">
              When enabled, public content is hidden from visitors. Admins can still view and manage the site.
            </p>
          </div>
          <Switch
            v-model="form.maintenance_mode"
            :disabled="isSaving"
          />
        </div>

        <!-- Organization Name -->
        <div class="space-y-2">
          <Label for="name">Organization Name</Label>
          <Input
            id="name"
            v-model="form.name"
            placeholder="Sunset Heights HOA"
            :disabled="isSaving"
          />
        </div>

        <!-- Legal Name -->
        <div class="space-y-2">
          <Label for="legal_name">Legal Name</Label>
          <Input
            id="legal_name"
            v-model="form.legal_name"
            placeholder="Sunset Heights Homeowners Association, Inc."
            :disabled="isSaving"
          />
          <p class="text-xs text-muted-foreground">
            Official legal name used for copyright notices and legal documents
          </p>
        </div>

        <!-- Slug (Read-only) -->
        <div class="space-y-2">
          <Label for="slug">URL Slug</Label>
          <div class="flex items-center gap-2">
            <Input
              id="slug"
              :modelValue="organization.slug"
              disabled
              class="bg-muted"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              @click="navigateTo('/domain-setup')"
            >
              <Icon name="lucide:globe" class="h-4 w-4 mr-1" />
              Domain
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">
            Your site URL: {{ siteUrl }}
          </p>
        </div>

        <!-- Contact Email -->
        <div class="space-y-2">
          <Label for="email">Contact Email</Label>
          <Input
            id="email"
            v-model="form.email"
            type="email"
            placeholder="contact@yourhoa.com"
            :disabled="isSaving"
          />
        </div>

        <!-- Phone -->
        <div class="space-y-2">
          <Label for="phone">Phone Number</Label>
          <Input
            id="phone"
            v-model="form.phone"
            type="tel"
            placeholder="(555) 123-4567"
            :disabled="isSaving"
          />
        </div>

        <!-- Address Section -->
        <div class="pt-4 border-t">
          <h4 class="font-medium mb-4">Address</h4>

          <div class="space-y-4">
            <!-- Street Address -->
            <div class="space-y-2">
              <Label for="street_address">Street Address</Label>
              <Input
                id="street_address"
                v-model="form.street_address"
                placeholder="123 Main Street"
                :disabled="isSaving"
              />
            </div>

            <!-- City, State, ZIP -->
            <div class="grid grid-cols-6 gap-4">
              <div class="col-span-3 space-y-2">
                <Label for="city">City</Label>
                <Input
                  id="city"
                  v-model="form.city"
                  placeholder="Los Angeles"
                  :disabled="isSaving"
                />
              </div>
              <div class="col-span-1 space-y-2">
                <Label for="state">State</Label>
                <Input
                  id="state"
                  v-model="form.state"
                  placeholder="CA"
                  maxlength="2"
                  :disabled="isSaving"
                />
              </div>
              <div class="col-span-2 space-y-2">
                <Label for="zip">ZIP Code</Label>
                <Input
                  id="zip"
                  v-model="form.zip"
                  placeholder="90001"
                  :disabled="isSaving"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Display Options Section -->
        <div class="pt-4 border-t">
          <h4 class="font-medium mb-4">Display Options</h4>

          <div class="space-y-4">
            <!-- Show Board Toggle -->
            <div class="flex items-center justify-between p-4 rounded-lg border">
              <div class="space-y-0.5">
                <Label class="text-base font-medium">Show Board Members</Label>
                <p class="text-sm text-muted-foreground">
                  Display the board of directors section on your public site and navigation
                </p>
              </div>
              <Switch
                v-model="form.show_board"
                :disabled="isSaving"
              />
            </div>
          </div>
        </div>

        <!-- Submit Button -->
        <div class="flex justify-end pt-4">
          <Button type="submit" :disabled="isSaving || !hasChanges">
            <Icon
              v-if="isSaving"
              name="lucide:loader-2"
              class="mr-2 h-4 w-4 animate-spin"
            />
            {{ isSaving ? "Saving..." : "Save Changes" }}
          </Button>
        </div>
      </form>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import type { HoaOrganization } from "~~/types/directus";
import { toast } from "vue-sonner";

const props = defineProps<{
  organization: HoaOrganization;
}>();

const emit = defineEmits<{
  updated: [organization: HoaOrganization];
}>();

const config = useRuntimeConfig();
const { update: updateOrganization } = useDirectusItems<HoaOrganization>("hoa_organizations");

const isSaving = ref(false);

// Form data - use reactive for better nested reactivity
const form = reactive({
  name: props.organization.name || "",
  legal_name: props.organization.legal_name || "",
  email: props.organization.email || "",
  phone: props.organization.phone || "",
  street_address: props.organization.street_address || "",
  city: props.organization.city || "",
  state: props.organization.state || "",
  zip: props.organization.zip || "",
  maintenance_mode: props.organization.maintenance_mode ?? false,
  show_board: props.organization.show_board ?? true,
});

// Site URL
const siteUrl = computed(() => {
  const baseUrl = config.public.appUrl || "https://propertyflow.app";
  if (props.organization.custom_domain && props.organization.domain_verified) {
    return `https://${props.organization.custom_domain}`;
  }
  return `${baseUrl}/${props.organization.slug}`;
});

// Check if form has changes
const hasChanges = computed(() => {
  return (
    form.name !== (props.organization.name || "") ||
    form.legal_name !== (props.organization.legal_name || "") ||
    form.email !== (props.organization.email || "") ||
    form.phone !== (props.organization.phone || "") ||
    form.street_address !== (props.organization.street_address || "") ||
    form.city !== (props.organization.city || "") ||
    form.state !== (props.organization.state || "") ||
    form.zip !== (props.organization.zip || "") ||
    form.maintenance_mode !== (props.organization.maintenance_mode ?? false) ||
    form.show_board !== (props.organization.show_board ?? true)
  );
});

// Watch for prop changes
watch(
  () => props.organization,
  (newOrg) => {
    form.name = newOrg.name || "";
    form.legal_name = newOrg.legal_name || "";
    form.email = newOrg.email || "";
    form.phone = newOrg.phone || "";
    form.street_address = newOrg.street_address || "";
    form.city = newOrg.city || "";
    form.state = newOrg.state || "";
    form.zip = newOrg.zip || "";
    form.maintenance_mode = newOrg.maintenance_mode ?? false;
    form.show_board = newOrg.show_board ?? true;
  },
  { deep: true }
);

// Save changes
const saveChanges = async () => {
  if (!hasChanges.value) return;

  isSaving.value = true;

  try {
    const updated = await updateOrganization(props.organization.id, {
      name: form.name,
      legal_name: form.legal_name,
      email: form.email,
      phone: form.phone,
      street_address: form.street_address,
      city: form.city,
      state: form.state,
      zip: form.zip,
      maintenance_mode: form.maintenance_mode,
      show_board: form.show_board,
    });

    emit("updated", { ...props.organization, ...updated });
  } catch (error: any) {
    console.error("Failed to save organization:", error);
    toast.error(error.message || "Failed to save changes");
  } finally {
    isSaving.value = false;
  }
};
</script>

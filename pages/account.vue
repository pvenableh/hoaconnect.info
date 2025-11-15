<template>
  <div class="container mx-auto px-4 py-8">
    <div class="max-w-4xl mx-auto">
      <!-- Page Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold">Account Settings</h1>
        <p class="text-muted-foreground mt-2">
          Manage your account information and preferences
        </p>
      </div>

      <!-- Account Tabs -->
      <div class="flex space-x-1 border-b mb-6">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="[
            'px-4 py-2 text-sm font-medium transition-colors relative',
            activeTab === tab.id
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground',
          ]"
        >
          {{ tab.label }}
          <span
            v-if="activeTab === tab.id"
            class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
          />
        </button>
      </div>

      <!-- Profile Tab -->
      <div v-if="activeTab === 'profile'" class="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>
              Update your personal details and contact information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form @submit.prevent="updateProfile" class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <!-- First Name -->
                <div class="space-y-2">
                  <Label for="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    v-model="profileForm.first_name"
                    :disabled="isUpdating"
                  />
                </div>

                <!-- Last Name -->
                <div class="space-y-2">
                  <Label for="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    v-model="profileForm.last_name"
                    :disabled="isUpdating"
                  />
                </div>
              </div>

              <!-- Display Name -->
              <div class="space-y-2">
                <Label for="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  v-model="profileForm.display_name"
                  placeholder="How you want to be displayed"
                  :disabled="isUpdating"
                />
              </div>

              <!-- Email (Read-only) -->
              <div class="space-y-2">
                <Label for="email">Email</Label>
                <Input
                  id="email"
                  :modelValue="user?.email"
                  type="email"
                  disabled
                  class="bg-muted"
                />
                <p class="text-xs text-muted-foreground">
                  Primary email cannot be changed
                </p>
              </div>

              <!-- Phone -->
              <div class="space-y-2">
                <Label for="phone">Phone</Label>
                <Input
                  id="phone"
                  v-model="profileForm.phone"
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                  :disabled="isUpdating"
                />
              </div>

              <!-- Bio -->
              <div class="space-y-2">
                <Label for="bio">Bio</Label>
                <textarea
                  id="bio"
                  v-model="profileForm.bio"
                  rows="4"
                  class="w-full px-3 py-2 border rounded-md bg-background"
                  placeholder="Tell us about yourself..."
                  :disabled="isUpdating"
                />
              </div>

              <!-- Company & Job Title -->
              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                  <Label for="company">Company</Label>
                  <Input
                    id="company"
                    v-model="profileForm.company"
                    placeholder="Your company"
                    :disabled="isUpdating"
                  />
                </div>
                <div class="space-y-2">
                  <Label for="jobTitle">Job Title</Label>
                  <Input
                    id="jobTitle"
                    v-model="profileForm.job_title"
                    placeholder="Your role"
                    :disabled="isUpdating"
                  />
                </div>
              </div>

              <!-- Website -->
              <div class="space-y-2">
                <Label for="website">Website</Label>
                <Input
                  id="website"
                  v-model="profileForm.website"
                  type="url"
                  placeholder="https://example.com"
                  :disabled="isUpdating"
                />
              </div>

              <!-- Success/Error Messages -->
              <Alert v-if="updateSuccess" variant="success">
                <Icon name="lucide:check-circle" class="h-4 w-4" />
                <div class="ml-2">Profile updated successfully!</div>
              </Alert>

              <Alert v-if="updateError" variant="destructive">
                <Icon name="lucide:alert-circle" class="h-4 w-4" />
                <div class="ml-2">{{ updateError }}</div>
              </Alert>

              <!-- Submit Button -->
              <div class="flex justify-end">
                <UiButton type="submit" :disabled="isUpdating">
                  <Icon
                    v-if="isUpdating"
                    name="lucide:loader-2"
                    class="mr-2 h-4 w-4 animate-spin"
                  />
                  {{ isUpdating ? "Saving..." : "Save Changes" }}
                </UiButton>
              </div>
            </form>
          </CardContent>
        </Card>

        <!-- Address Section -->
        <Card>
          <CardHeader>
            <CardTitle>Address</CardTitle>
            <CardDescription> Your mailing address </CardDescription>
          </CardHeader>
          <CardContent>
            <form @submit.prevent="updateAddress" class="space-y-4">
              <div class="space-y-2">
                <Label>Street Address</Label>
                <Input
                  v-model="addressForm.address_line1"
                  placeholder="123 Main Street"
                  :disabled="isUpdating"
                />
                <Input
                  v-model="addressForm.address_line2"
                  placeholder="Apartment, suite, etc. (optional)"
                  :disabled="isUpdating"
                />
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                  <Label>City</Label>
                  <Input
                    v-model="addressForm.city"
                    placeholder="San Francisco"
                    :disabled="isUpdating"
                  />
                </div>
                <div class="space-y-2">
                  <Label>State/Province</Label>
                  <Input
                    v-model="addressForm.state_province"
                    placeholder="CA"
                    :disabled="isUpdating"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                  <Label>Postal Code</Label>
                  <Input
                    v-model="addressForm.postal_code"
                    placeholder="12345"
                    :disabled="isUpdating"
                  />
                </div>
                <div class="space-y-2">
                  <Label>Country</Label>
                  <Input
                    v-model="addressForm.country"
                    placeholder="United States"
                    :disabled="isUpdating"
                  />
                </div>
              </div>

              <div class="flex justify-end">
                <UiButton type="submit" :disabled="isUpdating">
                  Save Address
                </UiButton>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <!-- Security Tab -->
      <div v-if="activeTab === 'security'" class="space-y-6">
        <!-- Password Change -->
        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>
              Update your password to keep your account secure
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form @submit.prevent="changePassword" class="space-y-4">
              <div class="space-y-2">
                <Label for="currentPassword">Current Password</Label>
                <Input
                  id="currentPassword"
                  v-model="passwordForm.currentPassword"
                  type="password"
                  :disabled="isUpdating"
                />
              </div>

              <div class="space-y-2">
                <Label for="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  v-model="passwordForm.newPassword"
                  type="password"
                  :disabled="isUpdating"
                />
                <p class="text-xs text-muted-foreground">
                  Must be at least 8 characters with uppercase, lowercase, and
                  numbers
                </p>
              </div>

              <div class="space-y-2">
                <Label for="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  v-model="passwordForm.confirmPassword"
                  type="password"
                  :disabled="isUpdating"
                />
              </div>

              <Alert v-if="passwordError" variant="destructive">
                <Icon name="lucide:alert-circle" class="h-4 w-4" />
                <div class="ml-2">{{ passwordError }}</div>
              </Alert>

              <Alert v-if="passwordSuccess" variant="success">
                <Icon name="lucide:check-circle" class="h-4 w-4" />
                <div class="ml-2">Password changed successfully!</div>
              </Alert>

              <div class="flex justify-end">
                <UiButton type="submit" :disabled="isUpdating">
                  Change Password
                </UiButton>
              </div>
            </form>
          </CardContent>
        </Card>

        <!-- Connected Accounts -->
        <Card>
          <CardHeader>
            <CardTitle>Connected Accounts</CardTitle>
            <CardDescription> Manage your OAuth connections </CardDescription>
          </CardHeader>
          <CardContent>
            <div class="space-y-4">
              <div
                class="flex items-center justify-between p-4 border rounded-lg"
              >
                <div class="flex items-center gap-3">
                  <Icon name="lucide:github" class="h-5 w-5" />
                  <div>
                    <p class="font-medium">GitHub</p>
                    <p class="text-sm text-muted-foreground">Not connected</p>
                  </div>
                </div>
                <UiButton
                  variant="outline"
                  size="sm"
                  @click="connectOAuth('github')"
                >
                  Connect
                </UiButton>
              </div>

              <div
                class="flex items-center justify-between p-4 border rounded-lg"
              >
                <div class="flex items-center gap-3">
                  <Icon name="lucide:mail" class="h-5 w-5" />
                  <div>
                    <p class="font-medium">Google</p>
                    <p class="text-sm text-muted-foreground">Not connected</p>
                  </div>
                </div>
                <UiButton
                  variant="outline"
                  size="sm"
                  @click="connectOAuth('google')"
                >
                  Connect
                </UiButton>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Preferences Tab -->
      <div v-if="activeTab === 'preferences'" class="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>
              Manage how you receive notifications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form @submit.prevent="updatePreferences" class="space-y-4">
              <div class="space-y-3">
                <label class="flex items-center gap-3">
                  <input
                    v-model="preferencesForm.email_notifications"
                    type="checkbox"
                    class="rounded border-gray-300"
                  />
                  <div>
                    <p class="font-medium">Email Notifications</p>
                    <p class="text-sm text-muted-foreground">
                      Receive updates via email
                    </p>
                  </div>
                </label>

                <label class="flex items-center gap-3">
                  <input
                    v-model="preferencesForm.newsletter_subscribed"
                    type="checkbox"
                    class="rounded border-gray-300"
                  />
                  <div>
                    <p class="font-medium">Newsletter</p>
                    <p class="text-sm text-muted-foreground">
                      Receive our weekly newsletter
                    </p>
                  </div>
                </label>
              </div>

              <div class="flex justify-end">
                <UiButton type="submit" :disabled="isUpdating">
                  Save Preferences
                </UiButton>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription> Customize your interface </CardDescription>
          </CardHeader>
          <CardContent>
            <div class="space-y-4">
              <div class="space-y-2">
                <Label>Theme</Label>
                <select
                  v-model="preferencesForm.theme"
                  @change="updateTheme"
                  class="w-full px-3 py-2 border rounded-md bg-background"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="auto">System</option>
                </select>
              </div>

              <div class="space-y-2">
                <Label>Language</Label>
                <select
                  v-model="preferencesForm.locale"
                  class="w-full px-3 py-2 border rounded-md bg-background"
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                </select>
              </div>

              <div class="space-y-2">
                <Label>Timezone</Label>
                <select
                  v-model="preferencesForm.timezone"
                  class="w-full px-3 py-2 border rounded-md bg-background"
                >
                  <option value="America/New_York">Eastern Time</option>
                  <option value="America/Chicago">Central Time</option>
                  <option value="America/Denver">Mountain Time</option>
                  <option value="America/Los_Angeles">Pacific Time</option>
                  <option value="Europe/London">London</option>
                  <option value="Europe/Paris">Paris</option>
                  <option value="Asia/Tokyo">Tokyo</option>
                </select>
              </div>

              <div class="flex justify-end">
                <UiButton @click="updatePreferences" :disabled="isUpdating">
                  Save Appearance
                </UiButton>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { toast } from "vue-sonner";

// Auth & user data
const { user, fetchUser } = useDirectusAuth();

// Tab management
const tabs = [
  { id: "profile", label: "Profile" },
  { id: "security", label: "Security" },
  { id: "preferences", label: "Preferences" },
];
const activeTab = ref("profile");

// Loading states
const isUpdating = ref(false);
const updateSuccess = ref(false);
const updateError = ref<string | null>(null);
const passwordSuccess = ref(false);
const passwordError = ref<string | null>(null);

// Profile form
const profileForm = ref({
  first_name: "",
  last_name: "",
  display_name: "",
  phone: "",
  bio: "",
  company: "",
  job_title: "",
  website: "",
});

// Address form
const addressForm = ref({
  address_line1: "",
  address_line2: "",
  city: "",
  state_province: "",
  postal_code: "",
  country: "",
});

// Password form
const passwordForm = ref({
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
});

// Preferences form
const preferencesForm = ref({
  email_notifications: true,
  newsletter_subscribed: false,
  theme: "auto",
  locale: "en",
  timezone: "America/New_York",
});

// Load profile data
onMounted(async () => {
  if (user.value) {
    // Load profile form from user data
    profileForm.value = {
      first_name: user.value?.first_name || "",
      last_name: user.value?.last_name || "",
      display_name: "",
      phone: "",
      bio: "",
      company: "",
      job_title: "",
      website: "",
    };

    // Load preferences
    preferencesForm.value = {
      email_notifications: true,
      newsletter_subscribed: false,
      theme: user.value?.theme || "auto",
      locale: "en",
      timezone: "America/New_York",
    };
  }
});

// Update profile
const updateProfile = async () => {
  isUpdating.value = true;
  updateError.value = null;
  updateSuccess.value = false;

  try {
    // Note: Profiles collection has been removed
    // Only updating user fields in directus_users
    toast.warning(
      "Profile updates are temporarily disabled while we migrate to the new data model"
    );

    // TODO: Implement user update endpoint
    // await $fetch('/api/account/update-user', {
    //   method: 'PATCH',
    //   body: {
    //     first_name: profileForm.value.first_name,
    //     last_name: profileForm.value.last_name
    //   }
    // })

    updateSuccess.value = false;
  } catch (error: any) {
    updateError.value = error?.message || "Failed to update profile";
    toast.error(updateError.value || "Failed to update profile");
  } finally {
    isUpdating.value = false;
  }
};

// Update address
const updateAddress = async () => {
  isUpdating.value = true;

  try {
    // Note: Profiles collection has been removed
    toast.warning(
      "Address updates are temporarily disabled while we migrate to the new data model"
    );
  } catch (error: any) {
    toast.error("Failed to update address");
  } finally {
    isUpdating.value = false;
  }
};

// Change password
const changePassword = async () => {
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    passwordError.value = "Passwords don't match";
    return;
  }

  isUpdating.value = true;
  passwordError.value = null;
  passwordSuccess.value = false;

  try {
    await $fetch("/api/account/change-password", {
      method: "POST",
      body: {
        currentPassword: passwordForm.value.currentPassword,
        newPassword: passwordForm.value.newPassword,
      },
    });

    passwordSuccess.value = true;
    toast.success("Password changed successfully!");

    // Clear form
    passwordForm.value = {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    };
  } catch (error: any) {
    passwordError.value = error?.message || "Failed to change password";
    toast.error(passwordError.value || "Failed to change password");
  } finally {
    isUpdating.value = false;
  }
};

// Update preferences
const updatePreferences = async () => {
  isUpdating.value = true;

  try {
    // Note: Profiles collection has been removed
    toast.warning(
      "Preference updates are temporarily disabled while we migrate to the new data model"
    );

    // TODO: Implement user update endpoint for theme
    // await $fetch('/api/account/update-user', {
    //   method: 'PATCH',
    //   body: {
    //     theme: preferencesForm.value.theme
    //   }
    // })
  } catch (error) {
    toast.error("Failed to update preferences");
  } finally {
    isUpdating.value = false;
  }
};

// Update theme immediately
const updateTheme = () => {
  // Apply theme to document
  if (preferencesForm.value.theme === "dark") {
    document.documentElement.classList.add("dark");
  } else if (preferencesForm.value.theme === "light") {
    document.documentElement.classList.remove("dark");
  } else {
    // Auto - use system preference
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }
};

// OAuth connections
const connectOAuth = (provider: string) => {
  window.location.href = `/api/auth/${provider}`;
};

const disconnectOAuth = async (provider: string) => {
  try {
    await $fetch(`/api/account/disconnect-oauth`, {
      method: "POST",
      body: { provider },
    });
    toast.success(`${provider} disconnected`);
    await fetchUser();
  } catch (error) {
    toast.error(`Failed to disconnect ${provider}`);
  }
};
</script>

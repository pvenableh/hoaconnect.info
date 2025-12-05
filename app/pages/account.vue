<template>
  <div class="container mx-auto px-4 py-8">
    <div class="max-w-4xl mx-auto">
      <!-- Page Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold">My Profile</h1>
        <p class="text-muted-foreground mt-2">
          Manage your account information and preferences
        </p>
      </div>

      <!-- Avatar Section -->
      <Card class="mb-6">
        <CardHeader>
          <CardTitle>Profile Picture</CardTitle>
          <CardDescription>
            Upload a profile picture to personalize your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex items-center gap-6">
            <!-- Avatar Preview -->
            <div class="relative">
              <Avatar class="h-24 w-24">
                <AvatarImage
                  v-if="avatarUrl"
                  :src="avatarUrl"
                  :alt="user?.firstName + ' ' + user?.lastName"
                />
                <AvatarFallback class="text-2xl">
                  {{ user?.firstName?.[0] }}{{ user?.lastName?.[0] }}
                </AvatarFallback>
              </Avatar>
              <button
                v-if="avatarUrl && !isUploadingAvatar"
                @click="removeAvatar"
                class="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90 transition"
                title="Remove avatar"
              >
                <Icon name="lucide:x" class="h-3 w-3" />
              </button>
            </div>

            <!-- Upload Controls -->
            <div class="flex-1">
              <input
                ref="avatarInput"
                type="file"
                accept="image/*"
                class="hidden"
                @change="handleAvatarUpload"
              />
              <Button
                @click="$refs.avatarInput.click()"
                :disabled="isUploadingAvatar"
                variant="outline"
              >
                <Icon
                  v-if="isUploadingAvatar"
                  name="lucide:loader-2"
                  class="mr-2 h-4 w-4 animate-spin"
                />
                <Icon v-else name="lucide:upload" class="mr-2 h-4 w-4" />
                {{ isUploadingAvatar ? "Uploading..." : "Upload Photo" }}
              </Button>
              <p class="text-xs text-muted-foreground mt-2">
                JPG, PNG or GIF. Max 5MB.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

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
                <Button type="submit" :disabled="isUpdating">
                  <Icon
                    v-if="isUpdating"
                    name="lucide:loader-2"
                    class="mr-2 h-4 w-4 animate-spin"
                  />
                  {{ isUpdating ? "Saving..." : "Save Changes" }}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <!-- Security Tab -->
      <div v-if="activeTab === 'security'" class="space-y-6">
        <!-- Password Reset Request -->
        <Card>
          <CardHeader>
            <CardTitle>Reset Password</CardTitle>
            <CardDescription>
              Request a password reset link to be sent to your email
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div class="space-y-4">
              <p class="text-sm text-muted-foreground">
                Click the button below to receive a password reset link at
                <strong>{{ user?.email }}</strong>
              </p>

              <Alert v-if="resetRequestSuccess" variant="success">
                <Icon name="lucide:check-circle" class="h-4 w-4" />
                <div class="ml-2">
                  Password reset link sent! Check your email.
                </div>
              </Alert>

              <Alert v-if="resetRequestError" variant="destructive">
                <Icon name="lucide:alert-circle" class="h-4 w-4" />
                <div class="ml-2">{{ resetRequestError }}</div>
              </Alert>

              <Button
                @click="requestPasswordReset"
                :disabled="isRequestingReset"
                variant="outline"
              >
                <Icon
                  v-if="isRequestingReset"
                  name="lucide:loader-2"
                  class="mr-2 h-4 w-4 animate-spin"
                />
                <Icon v-else name="lucide:mail" class="mr-2 h-4 w-4" />
                {{ isRequestingReset ? "Sending..." : "Send Reset Link" }}
              </Button>
            </div>
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
                <Button
                  variant="outline"
                  size="sm"
                  @click="connectOAuth('github')"
                >
                  Connect
                </Button>
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
                <Button
                  variant="outline"
                  size="sm"
                  @click="connectOAuth('google')"
                >
                  Connect
                </Button>
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
                <Button type="submit" :disabled="isUpdating">
                  Save Preferences
                </Button>
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
                <Button @click="updatePreferences" :disabled="isUpdating">
                  Save Appearance
                </Button>
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Auth & user data
const { user, refreshUser } = useDirectusAuth();
const { updateProfile: updateUserProfile, requestPasswordReset: requestReset } =
  useDirectusUser();
const config = useRuntimeConfig();

// Tab management
const tabs = [
  { id: "profile", label: "Profile" },
  { id: "security", label: "Security" },
  { id: "preferences", label: "Preferences" },
];
const activeTab = ref("profile");

// Loading states
const isUpdating = ref(false);
const isUploadingAvatar = ref(false);
const isRequestingReset = ref(false);
const updateSuccess = ref(false);
const updateError = ref<string | null>(null);
const resetRequestSuccess = ref(false);
const resetRequestError = ref<string | null>(null);

// Avatar state
const currentAvatarId = ref<string | null>(null);

// Avatar URL computed
const avatarUrl = computed(() => {
  const avatarId = currentAvatarId.value || user.value?.avatar;
  if (avatarId) {
    return `${config.public.directus.url}/assets/${avatarId}?key=medium-contain`;
  }
  return null;
});

// Profile form
const profileForm = ref({
  first_name: "",
  last_name: "",
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
    profileForm.value = {
      first_name: user.value?.firstName || "",
      last_name: user.value?.lastName || "",
    };
    currentAvatarId.value = user.value?.avatar || null;
  }
});

// Handle avatar upload
const handleAvatarUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (!file) return;

  // Validate file size (5MB max)
  if (file.size > 5 * 1024 * 1024) {
    toast.error("File size must be less than 5MB");
    return;
  }

  // Validate file type
  if (!file.type.startsWith("image/")) {
    toast.error("Please upload an image file");
    return;
  }

  isUploadingAvatar.value = true;

  try {
    // Create form data for upload
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", `Avatar - ${user.value?.firstName} ${user.value?.lastName}`);

    // Upload file to Directus
    const uploadResult = await $fetch("/api/directus/files/upload", {
      method: "POST",
      body: formData,
    });

    if (uploadResult?.id) {
      // Update user profile with new avatar
      await updateUserProfile({ avatar: uploadResult.id });

      // Update local state
      currentAvatarId.value = uploadResult.id;

      // Refresh user session
      await refreshUser();

      toast.success("Profile picture updated!");
    }
  } catch (error: any) {
    console.error("Avatar upload error:", error);
    toast.error(error?.message || "Failed to upload avatar");
  } finally {
    isUploadingAvatar.value = false;
    // Reset file input
    target.value = "";
  }
};

// Remove avatar
const removeAvatar = async () => {
  isUploadingAvatar.value = true;

  try {
    await updateUserProfile({ avatar: null });
    currentAvatarId.value = null;
    await refreshUser();
    toast.success("Profile picture removed");
  } catch (error: any) {
    toast.error(error?.message || "Failed to remove avatar");
  } finally {
    isUploadingAvatar.value = false;
  }
};

// Update profile
const updateProfile = async () => {
  isUpdating.value = true;
  updateError.value = null;
  updateSuccess.value = false;

  try {
    await updateUserProfile({
      first_name: profileForm.value.first_name,
      last_name: profileForm.value.last_name,
    });

    await refreshUser();
    updateSuccess.value = true;
    toast.success("Profile updated successfully!");
  } catch (error: any) {
    updateError.value = error?.message || "Failed to update profile";
    toast.error(updateError.value || "Failed to update profile");
  } finally {
    isUpdating.value = false;
  }
};

// Request password reset
const requestPasswordReset = async () => {
  if (!user.value?.email) return;

  isRequestingReset.value = true;
  resetRequestError.value = null;
  resetRequestSuccess.value = false;

  try {
    await requestReset(user.value.email);
    resetRequestSuccess.value = true;
    toast.success("Password reset link sent to your email!");
  } catch (error: any) {
    resetRequestError.value = error?.message || "Failed to send reset link";
    toast.error(resetRequestError.value || "Failed to send reset link");
  } finally {
    isRequestingReset.value = false;
  }
};

// Update preferences
const updatePreferences = async () => {
  isUpdating.value = true;

  try {
    toast.warning(
      "Preference updates are temporarily disabled while we migrate to the new data model"
    );
  } catch (error) {
    toast.error("Failed to update preferences");
  } finally {
    isUpdating.value = false;
  }
};

// Update theme immediately
const updateTheme = () => {
  if (preferencesForm.value.theme === "dark") {
    document.documentElement.classList.add("dark");
  } else if (preferencesForm.value.theme === "light") {
    document.documentElement.classList.remove("dark");
  } else {
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
</script>

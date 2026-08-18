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
                @click="avatarInput?.click()"
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
              <Alert v-if="updateSuccess" :variant="successVariant">
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

              <Alert v-if="resetRequestSuccess" :variant="successVariant">
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
          <CardContent class="space-y-6">
            <!-- Master email switch -->
            <label class="flex items-center justify-between gap-3">
              <div>
                <p class="font-medium">Email notifications</p>
                <p class="text-sm text-muted-foreground">
                  Master switch — turn off to stop all notification emails.
                </p>
              </div>
              <input v-model="emailMaster" type="checkbox" class="h-4 w-4 rounded border-gray-300" />
            </label>

            <!-- Per-category matrix -->
            <div class="overflow-hidden rounded-lg border">
              <div class="grid grid-cols-[1fr_4rem_4rem] items-center gap-x-2 border-b bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span>Category</span>
                <span class="text-center">In-app</span>
                <span class="text-center">Email</span>
              </div>
              <div
                v-for="cat in notifCategories"
                :key="cat.key"
                class="grid grid-cols-[1fr_4rem_4rem] items-center gap-x-2 border-b px-4 py-2.5 last:border-b-0"
              >
                <span class="text-sm">{{ cat.label }}</span>
                <input
                  type="checkbox"
                  class="mx-auto h-4 w-4 rounded border-gray-300"
                  :checked="catBell(cat.key)"
                  @change="setCatBell(cat.key, ($event.target as HTMLInputElement).checked)"
                />
                <input
                  type="checkbox"
                  class="mx-auto h-4 w-4 rounded border-gray-300 disabled:opacity-40"
                  :checked="catEmail(cat.key)"
                  :disabled="!emailMaster"
                  @change="setCatEmail(cat.key, ($event.target as HTMLInputElement).checked)"
                />
              </div>
            </div>

            <p class="text-xs text-muted-foreground">
              "In-app" covers the notification bell and, if you turn them on below, push
              notifications on your devices.
            </p>

            <div class="flex justify-end">
              <Button :disabled="isUpdating" @click="updatePreferences">Save preferences</Button>
            </div>
          </CardContent>
        </Card>

        <!-- Push notifications -->
        <Card v-if="push.serverEnabled.value || push.unsupportedReason.value === 'ios-install'">
          <CardHeader>
            <CardTitle>Push notifications</CardTitle>
            <CardDescription>
              Get notified on this device even when HOA Connect isn't open.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- Ready to turn on / already on -->
            <template v-if="push.supported.value">
              <label class="flex items-center justify-between gap-3">
                <div>
                  <p class="font-medium">Notifications on this device</p>
                  <p class="text-sm text-muted-foreground">
                    {{
                      push.subscribed.value
                        ? "This device will receive push notifications."
                        : "Turn on to receive notifications on this device."
                    }}
                  </p>
                </div>
                <Button
                  size="sm"
                  :variant="push.subscribed.value ? 'outline' : 'default'"
                  :disabled="push.busy.value"
                  @click="togglePush"
                >
                  {{ push.subscribed.value ? "Turn off" : "Turn on" }}
                </Button>
              </label>

              <div
                v-if="push.permission.value === 'denied'"
                class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
              >
                Your browser is blocking notifications for this site. Allow them in your
                browser's site settings, then try again.
              </div>

              <div v-if="push.subscribed.value" class="flex items-center gap-3">
                <Button size="sm" variant="outline" :disabled="push.busy.value" @click="testPush">
                  Send a test notification
                </Button>
                <span v-if="pushTestMessage" class="text-sm text-muted-foreground">
                  {{ pushTestMessage }}
                </span>
              </div>
            </template>

            <!-- iOS: supported, but only once the app is on the Home Screen -->
            <div
              v-else-if="push.unsupportedReason.value === 'ios-install'"
              class="space-y-2 text-sm text-muted-foreground"
            >
              <p class="font-medium text-foreground">Add HOA Connect to your Home Screen first</p>
              <p>
                On iPhone and iPad, notifications work once the app is installed. In Safari, tap
                the Share button, choose <strong>Add to Home Screen</strong>, then open HOA
                Connect from your Home Screen and come back here.
              </p>
            </div>

            <p v-else-if="push.unsupportedReason.value === 'ios-old'" class="text-sm text-muted-foreground">
              Notifications need iOS 16.4 or later. Update your device to turn them on.
            </p>

            <p v-else class="text-sm text-muted-foreground">
              This browser doesn't support push notifications. You'll still get everything in
              your notification bell and by email.
            </p>
          </CardContent>
        </Card>

        <!-- Email digest -->
        <Card>
          <CardHeader>
            <CardTitle>Email digest</CardTitle>
            <CardDescription>A periodic summary of what's new in your community.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-5">
            <label class="flex items-center justify-between gap-3">
              <div>
                <p class="font-medium">Send me a digest</p>
                <p class="text-sm text-muted-foreground">A daily or weekly roundup email.</p>
              </div>
              <input v-model="digestEnabled" type="checkbox" class="h-4 w-4 rounded border-gray-300" />
            </label>

            <div v-if="digestEnabled" class="space-y-4">
              <div class="grid gap-4 sm:grid-cols-2">
                <div class="space-y-2">
                  <Label>Frequency</Label>
                  <select v-model="digestCadence" class="w-full rounded-md border bg-background px-3 py-2">
                    <option value="daily">Every day</option>
                    <option value="weekdays">Weekdays only</option>
                    <option value="weekly">Weekly (Mondays)</option>
                    <option value="off">Off</option>
                  </select>
                </div>
                <div class="space-y-2">
                  <Label>Time</Label>
                  <select v-model.number="digestHour" class="w-full rounded-md border bg-background px-3 py-2">
                    <option v-for="h in 24" :key="h - 1" :value="h - 1">{{ formatHour(h - 1) }}</option>
                  </select>
                </div>
              </div>
              <div class="space-y-2">
                <Label>Include</Label>
                <div class="grid gap-2 sm:grid-cols-2">
                  <label v-for="s in digestSectionDefs" :key="s.key" class="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      class="h-4 w-4 rounded border-gray-300"
                      :checked="hasSection(s.key)"
                      @change="toggleSection(s.key, ($event.target as HTMLInputElement).checked)"
                    />
                    {{ s.label }}
                  </label>
                </div>
              </div>
            </div>

            <div class="flex justify-end">
              <Button :disabled="isUpdating" @click="updatePreferences">Save preferences</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription> Customize your interface theme and style </CardDescription>
          </CardHeader>
          <CardContent>
            <div class="space-y-6">
              <!-- Theme Selector Component -->
              <ThemeSelector />

              <Separator />

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
                  Save Preferences
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
import { Separator } from "@/components/ui/separator";

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
const avatarInput = ref<HTMLInputElement | null>(null);

// Alert's cva typing only knows "default" | "destructive"; keep the existing
// runtime value ("success") while satisfying the prop type.
const successVariant = "success" as unknown as "default";

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
  locale: "en",
  timezone: "America/New_York",
});

// ── Unified notification preferences ─────────────────────────────────────────
import {
  NOTIFICATION_CATEGORIES,
  DIGEST_SECTIONS,
  type DigestCadence,
  type DigestSection,
} from "#core/shared/notifications/preferences";

const notifCategories = NOTIFICATION_CATEGORIES;
const digestSectionDefs = DIGEST_SECTIONS;

const emailMaster = ref(true);
const notifPrefs = ref<Record<string, any>>({});

// Per-category channel toggles (missing key = on).
const catEmail = (cat: string) => notifPrefs.value[cat] !== false;
const setCatEmail = (cat: string, v: boolean) => {
  notifPrefs.value = { ...notifPrefs.value, [cat]: v };
};
const catBell = (cat: string) => notifPrefs.value[`${cat}_bell`] !== false;
const setCatBell = (cat: string, v: boolean) => {
  notifPrefs.value = { ...notifPrefs.value, [`${cat}_bell`]: v };
};

// Web push. The composable owns capability/permission/subscription state; this
// page only drives it. Kept as one object (not destructured) so the template can
// read `.value` on each ref without a wall of local aliases.
const push = usePush();
const pushTestMessage = ref("");

const togglePush = async () => {
  pushTestMessage.value = "";
  if (push.subscribed.value) {
    await push.disable();
    return;
  }
  // Must run inside the click handler: browsers reject a permission prompt that
  // isn't tied to a user gesture, and Safari hard-denies for the session.
  const ok = await push.enable();
  if (!ok && push.permission.value !== "denied") {
    pushTestMessage.value = "Couldn't turn on notifications. Try again.";
  }
};

const testPush = async () => {
  pushTestMessage.value = "Sending…";
  try {
    const sent = await push.sendTest();
    pushTestMessage.value = sent
      ? "Sent — check your notifications."
      : "Nothing to send to. Try turning notifications off and on again.";
  } catch {
    pushTestMessage.value = "Couldn't send a test notification.";
  }
};

// Digest fields (writable computeds over the same blob).
const digestEnabled = computed({
  get: () => notifPrefs.value.digest_enabled === true,
  set: (v: boolean) => (notifPrefs.value = { ...notifPrefs.value, digest_enabled: v }),
});
const digestCadence = computed<DigestCadence>({
  get: () => (notifPrefs.value.digest_cadence as DigestCadence) || "weekly",
  set: (v: DigestCadence) => (notifPrefs.value = { ...notifPrefs.value, digest_cadence: v }),
});
const digestHour = computed<number>({
  get: () => (typeof notifPrefs.value.digest_hour === "number" ? notifPrefs.value.digest_hour : 8),
  set: (v: number) => (notifPrefs.value = { ...notifPrefs.value, digest_hour: v }),
});
const hasSection = (key: DigestSection) => {
  const s = notifPrefs.value.digest_sections;
  // Default: all sections included until the user narrows the list.
  return Array.isArray(s) ? s.includes(key) : true;
};
const toggleSection = (key: DigestSection, on: boolean) => {
  const cur: DigestSection[] = Array.isArray(notifPrefs.value.digest_sections)
    ? notifPrefs.value.digest_sections
    : DIGEST_SECTIONS.map((s) => s.key);
  const next = on ? [...new Set([...cur, key])] : cur.filter((k) => k !== key);
  notifPrefs.value = { ...notifPrefs.value, digest_sections: next };
};

const formatHour = (h: number) => {
  const period = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:00 ${period}`;
};

const loadNotificationPreferences = async () => {
  try {
    const r = await $fetch<{
      email_notifications: boolean;
      notification_preferences: Record<string, any>;
    }>("/api/user/notification-preferences");
    emailMaster.value = r.email_notifications !== false;
    notifPrefs.value = r.notification_preferences || {};
  } catch {
    /* keep defaults */
  }
};
onMounted(loadNotificationPreferences);

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

// Update preferences — persists the unified notification prefs (master email
// switch + per-category toggles + digest settings).
const updatePreferences = async () => {
  isUpdating.value = true;
  try {
    await $fetch("/api/user/notification-preferences", {
      method: "PATCH",
      body: {
        email_notifications: emailMaster.value,
        notification_preferences: notifPrefs.value,
      },
    });
    toast.success("Notification preferences saved");
  } catch (error) {
    toast.error("Failed to update preferences");
  } finally {
    isUpdating.value = false;
  }
};

// OAuth connections
const connectOAuth = (provider: string) => {
  window.location.href = `/api/auth/${provider}`;
};
</script>

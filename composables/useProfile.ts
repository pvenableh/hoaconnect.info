// composables/useProfile.ts
// DEPRECATED: The profiles collection has been removed.
// User data is now stored directly in directus_users.
// Organization-specific data is in hoa_members.
// This composable is kept for backward compatibility but returns stubs.

import { toast } from "vue-sonner";

export const useProfile = () => {
  const { user } = useDirectusAuth();
  const loading = useState<boolean>("profile.loading", () => false);

  // Profile is now just the user data
  const profile = computed(() => user.value || null);

  const fetchProfile = async () => {
    console.warn("useProfile.fetchProfile is deprecated. Use useDirectusAuth().fetchUser() instead.");
    return user.value;
  };

  const updateProfile = async (data: any) => {
    console.warn("useProfile.updateProfile is deprecated. The profiles collection has been removed.");
    toast.error("Profile updates are no longer supported through this method");
    throw new Error("Profiles collection has been removed");
  };

  const uploadAvatar = async (file: File) => {
    console.warn("useProfile.uploadAvatar is deprecated.");
    toast.error("Avatar upload is no longer supported through this method");
    throw new Error("Profiles collection has been removed");
  };

  const profileCompletion = computed(() => {
    if (!user.value) return 0;
    // Basic completion based on user fields
    const fields = ["first_name", "last_name", "email"];
    const completed = fields.filter((field) => {
      const value = (user.value as any)?.[field];
      return value !== null && value !== undefined && value !== "";
    }).length;
    return Math.round((completed / fields.length) * 100);
  });

  const isProfileComplete = computed(() => {
    return profileCompletion.value >= 80;
  });

  return {
    profile,
    loading: readonly(loading),
    profileCompletion,
    isProfileComplete,
    fetchProfile,
    updateProfile,
    uploadAvatar,
  };
};

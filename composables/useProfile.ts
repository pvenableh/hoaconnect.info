// composables/useProfile.ts
import type { UserProfile, ProfileSchema } from "~/types/directus";
import { toast } from "vue-sonner";

export const useProfile = () => {
  const { user } = useDirectusAuth();
  const loading = useState<boolean>("profile.loading", () => false);

  // Get current profile
  const profile = computed(() => user.value?.profile || null);

  // Fetch profile from API
  const fetchProfile = async () => {
    if (!user.value) return null;

    loading.value = true;
    try {
      const data = await $fetch(`/api/profile/${user.value.id}`);
      return data;
    } catch (error) {
      console.error("Failed to fetch profile:", error);
      return null;
    } finally {
      loading.value = false;
    }
  };

  // Update profile
  const updateProfile = async (data: Partial<ProfileSchema>) => {
    if (!user.value) {
      throw new Error("User not authenticated");
    }

    loading.value = true;
    try {
      const updatedProfile = await $fetch("/api/profile/update", {
        method: "PATCH",
        body: data,
      });

      // Update local state
      if (user.value) {
        user.value.profile = updatedProfile as UserProfile;
      }

      toast.success("Profile updated successfully");
      return updatedProfile;
    } catch (error: any) {
      const message = error.data?.statusMessage || "Failed to update profile";
      toast.error(message);
      throw error;
    } finally {
      loading.value = false;
    }
  };

  // Upload avatar
  const uploadAvatar = async (file: File) => {
    if (!user.value) {
      throw new Error("User not authenticated");
    }

    loading.value = true;
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await $fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      // Update local state
      if (user.value && user.value.profile) {
        user.value.profile.avatar_url = response.url;
      }

      toast.success("Avatar updated successfully");
      return response;
    } catch (error: any) {
      const message = error.data?.statusMessage || "Failed to upload avatar";
      toast.error(message);
      throw error;
    } finally {
      loading.value = false;
    }
  };

  // Calculate profile completion percentage
  const profileCompletion = computed(() => {
    if (!profile.value) return 0;

    const fields = [
      "display_name",
      "bio",
      "phone",
      "company",
      "job_title",
      "address_line1",
      "city",
      "state_province",
      "postal_code",
      "country",
    ];

    const completed = fields.filter((field) => {
      const value = (profile.value as any)[field];
      return value !== null && value !== undefined && value !== "";
    }).length;

    return Math.round((completed / fields.length) * 100);
  });

  // Check if profile is complete
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

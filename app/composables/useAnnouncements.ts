// composables/useAnnouncements.ts
/**
 * useAnnouncements - Composable for managing announcement state and interactions
 *
 * Provides:
 * - Fetching announcements from Directus
 * - Seen/unseen tracking via localStorage
 * - Global state for selected announcement (sheet)
 * - Type-based styling helpers
 * - Expiration warnings
 */

import type { HoaAnnouncement } from "~~/types/directus";

// Storage key prefix - will be combined with org ID
const STORAGE_KEY_PREFIX = "hoa-seen-announcements";

// Global state for the currently selected announcement (for sheet)
const selectedAnnouncement = ref<HoaAnnouncement | null>(null);
const isSheetOpen = ref(false);

export const useAnnouncements = () => {
  const { list: listAnnouncements } = useDirectusItems("hoa_announcements");

  // Access shared state from useSelectedOrg
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);

  // Build storage key with org ID for multi-org support
  const getStorageKey = () =>
    `${STORAGE_KEY_PREFIX}-${selectedOrgId.value || "default"}`;

  // Get seen announcement IDs from localStorage
  const getSeenIds = (): string[] => {
    if (!import.meta.client) return [];
    try {
      const stored = localStorage.getItem(getStorageKey());
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };

  // Save seen announcement IDs to localStorage
  const saveSeenIds = (ids: string[]) => {
    if (!import.meta.client) return;
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(ids));
    } catch (error) {
      console.error("Failed to save seen announcements:", error);
    }
  };

  /**
   * Fetch announcements from Directus
   * @param audienceFilter - Array of audience types to filter by (e.g., ['all', 'owners'])
   */
  const fetchAnnouncements = async (
    audienceFilter: string[] = ["all"]
  ): Promise<HoaAnnouncement[]> => {
    if (!selectedOrgId.value) return [];

    try {
      const now = new Date().toISOString();
      const result = (await listAnnouncements({
        fields: [
          "id",
          "title",
          "content",
          "status",
          "announcement_type",
          "target_audience",
          "publish_date",
          "expiry_date",
          "is_pinned",
          "date_created",
          "button_text",
          "button_link",
          "external_link",
          "show_toast",
        ],
        filter: {
          organization: { _eq: selectedOrgId.value },
          status: { _eq: "published" },
          target_audience: { _in: audienceFilter },
          _or: [
            { expiry_date: { _null: true } },
            { expiry_date: { _gte: now } },
          ],
        },
        sort: ["-is_pinned", "-publish_date", "-date_created"],
      })) as HoaAnnouncement[];

      return result || [];
    } catch (error) {
      console.error("Error fetching announcements:", error);
      return [];
    }
  };

  /**
   * Mark announcement as seen
   */
  const markAsSeen = (announcementId: string) => {
    const seenIds = getSeenIds();
    if (!seenIds.includes(announcementId)) {
      saveSeenIds([...seenIds, announcementId]);
    }
  };

  /**
   * Mark all announcements as seen
   */
  const markAllAsSeen = (announcements: HoaAnnouncement[]) => {
    const seenIds = getSeenIds();
    const newIds = announcements
      .map((a) => a.id)
      .filter((id) => !seenIds.includes(id));
    if (newIds.length > 0) {
      saveSeenIds([...seenIds, ...newIds]);
    }
  };

  /**
   * Check if announcement has been seen
   */
  const isSeen = (announcementId: string): boolean => {
    return getSeenIds().includes(announcementId);
  };

  /**
   * Get unseen announcements
   */
  const getUnseenAnnouncements = (
    announcements: HoaAnnouncement[]
  ): HoaAnnouncement[] => {
    const seenIds = getSeenIds();
    return announcements.filter((a) => !seenIds.includes(a.id));
  };

  /**
   * Get unseen count
   */
  const getUnseenCount = (announcements: HoaAnnouncement[]): number => {
    return getUnseenAnnouncements(announcements).length;
  };

  /**
   * Clear all seen announcements (useful for testing)
   */
  const clearSeenAnnouncements = () => {
    if (!import.meta.client) return;
    localStorage.removeItem(getStorageKey());
  };

  /**
   * Open announcement in sheet
   */
  const openAnnouncement = (announcement: HoaAnnouncement) => {
    selectedAnnouncement.value = announcement;
    isSheetOpen.value = true;
    markAsSeen(announcement.id);
  };

  /**
   * Close announcement sheet
   */
  const closeAnnouncement = () => {
    isSheetOpen.value = false;
    // Delay clearing to allow for animation
    setTimeout(() => {
      selectedAnnouncement.value = null;
    }, 300);
  };

  /**
   * Get type-based styling classes
   */
  const getTypeClasses = (type: string | null | undefined) => {
    const types: Record<
      string,
      { bg: string; text: string; border: string; icon: string; label: string }
    > = {
      urgent: {
        bg: "bg-red-50 dark:bg-red-950/30",
        text: "text-red-700 dark:text-red-400",
        border: "border-red-200 dark:border-red-800",
        icon: "alert-triangle",
        label: "Urgent",
      },
      maintenance: {
        bg: "bg-amber-50 dark:bg-amber-950/30",
        text: "text-amber-700 dark:text-amber-400",
        border: "border-amber-200 dark:border-amber-800",
        icon: "wrench",
        label: "Maintenance",
      },
      event: {
        bg: "bg-blue-50 dark:bg-blue-950/30",
        text: "text-blue-700 dark:text-blue-400",
        border: "border-blue-200 dark:border-blue-800",
        icon: "calendar",
        label: "Event",
      },
      reminder: {
        bg: "bg-purple-50 dark:bg-purple-950/30",
        text: "text-purple-700 dark:text-purple-400",
        border: "border-purple-200 dark:border-purple-800",
        icon: "bell",
        label: "Reminder",
      },
      general: {
        bg: "bg-stone-50 dark:bg-stone-950/30",
        text: "text-stone-700 dark:text-stone-400",
        border: "border-stone-200 dark:border-stone-800",
        icon: "megaphone",
        label: "General",
      },
    };
    return types[type || "general"] || types.general;
  };

  /**
   * Check if announcement expires soon (within 3 days)
   */
  const expiresSoon = (announcement: HoaAnnouncement): boolean => {
    if (!announcement.expiry_date) return false;
    const expiryDate = new Date(announcement.expiry_date);
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    return expiryDate <= threeDaysFromNow && expiryDate > now;
  };

  /**
   * Format date for display
   */
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  /**
   * Format short date for compact display
   */
  const formatShortDate = (dateString: string | null | undefined): string => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return {
    // Data fetching
    fetchAnnouncements,

    // Seen tracking
    markAsSeen,
    markAllAsSeen,
    isSeen,
    getUnseenAnnouncements,
    getUnseenCount,
    clearSeenAnnouncements,

    // Sheet state (global)
    selectedAnnouncement: readonly(selectedAnnouncement),
    isSheetOpen: readonly(isSheetOpen),
    openAnnouncement,
    closeAnnouncement,

    // Helpers
    getTypeClasses,
    expiresSoon,
    formatDate,
    formatShortDate,
  };
};

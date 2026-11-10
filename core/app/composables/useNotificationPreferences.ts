/**
 * useNotificationPreferences — the per-category switches, where the member is
 * standing when they want them.
 *
 * The account page has owned these since the unified-preferences work, and it
 * still does. This exists because the moment someone wants to turn a category
 * off is the moment it just interrupted them — in the bell, three clicks and a
 * page away from the toggle. So the bell dropdown carries the same switches,
 * reading and writing the same `notification_preferences` blob through the same
 * endpoint. There is no second store and no local copy of the truth: a change
 * made here is visible on the account page on its next load, and vice versa.
 *
 * The bell dropdown uses only the BELL half (`<category>_bell`). The EMAIL half
 * (`<category>`, plus the master `email_enabled` switch) is here for the
 * Email section of the household page (Phase 3a), which shows the whole picture
 * — community mail, what is always sent, and this matrix — in one place. The
 * digest settings stay on the account page.
 *
 * Saves are optimistic and per-toggle. A switch that waited for a round trip
 * before moving would feel broken; a failed save reverts and says so.
 */

import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from "#core/shared/notifications/preferences";

const _prefs = ref<Record<string, unknown>>({});
const _emailMaster = ref(true);
const _loaded = ref(false);
const _loading = ref(false);

export function useNotificationPreferences() {
  /** Load once per session; callers can force a re-read after an external change. */
  async function load(force = false): Promise<void> {
    if (!import.meta.client) return;
    if (_loading.value) return;
    if (_loaded.value && !force) return;
    _loading.value = true;
    try {
      const r = await $fetch<{
        email_enabled?: boolean;
        notification_preferences?: Record<string, unknown>;
      }>("/api/user/notification-preferences");
      _prefs.value = r?.notification_preferences || {};
      _emailMaster.value = r?.email_enabled !== false;
      _loaded.value = true;
    } catch {
      // Absent preferences mean every category is on, which is also the
      // fallback the send path uses — so a failed read shows the truth.
      _prefs.value = {};
    } finally {
      _loading.value = false;
    }
  }

  /** Is the bell on for this category? Missing key = on, matching the send path. */
  function bellEnabled(category: NotificationCategory): boolean {
    return _prefs.value[`${category}_bell`] !== false;
  }

  /** Flip one category's bell. Returns false when the save was rolled back. */
  async function setBellEnabled(
    category: NotificationCategory,
    enabled: boolean
  ): Promise<boolean> {
    const key = `${category}_bell`;
    const previous = { ..._prefs.value };
    _prefs.value = { ..._prefs.value, [key]: enabled };
    try {
      await $fetch("/api/user/notification-preferences", {
        method: "PATCH",
        body: { notification_preferences: _prefs.value },
      });
      return true;
    } catch {
      _prefs.value = previous;
      return false;
    }
  }

  async function toggleBell(category: NotificationCategory): Promise<boolean> {
    return setBellEnabled(category, !bellEnabled(category));
  }

  /** Is email on for this category? Missing key = on, as `emailAllowed` reads it. */
  function emailEnabled(category: NotificationCategory): boolean {
    return _prefs.value[category] !== false;
  }

  /** Flip one category's email. Returns false when the save was rolled back. */
  async function setEmailEnabled(category: NotificationCategory, enabled: boolean): Promise<boolean> {
    const previous = { ..._prefs.value };
    _prefs.value = { ..._prefs.value, [category]: enabled };
    try {
      await $fetch("/api/user/notification-preferences", {
        method: "PATCH",
        body: { notification_preferences: _prefs.value },
      });
      return true;
    } catch {
      _prefs.value = previous;
      return false;
    }
  }

  /** The app's master email switch (`email_enabled`). Returns false when rolled back. */
  async function setEmailMaster(enabled: boolean): Promise<boolean> {
    const previous = _emailMaster.value;
    _emailMaster.value = enabled;
    try {
      await $fetch("/api/user/notification-preferences", {
        method: "PATCH",
        body: { email_enabled: enabled },
      });
      return true;
    } catch {
      _emailMaster.value = previous;
      return false;
    }
  }

  return {
    categories: NOTIFICATION_CATEGORIES,
    prefs: readonly(_prefs),
    isLoading: readonly(_loading),
    load,
    bellEnabled,
    setBellEnabled,
    toggleBell,
    emailMaster: readonly(_emailMaster),
    emailEnabled,
    setEmailEnabled,
    setEmailMaster,
  };
}

/**
 * Shared nav model for the public landing.
 *
 * One source of truth consumed by the theme-specific nav surfaces:
 *   • LandingDock   — modern iOS dock (all viewports)
 *   • LandingDrawer — classic/luxury dark-glass slide-in side menu (all viewports)
 *
 * The model: public "explore" anchors, the LOCKED member-portal sections (so a
 * logged-out visitor senses a full portal behind the page), Resident/Member
 * wording from shared/utils/terminology, and the login/request-access/create-account
 * actions. Inputs accept refs OR getters (toValue), so callers can pass either.
 */
import type { MaybeRefOrGetter } from "vue";
import { orgMemberNoun } from "#core/shared/utils/terminology";
import { normalizeLandingConfig, enabledLandingBlocks } from "#core/shared/utils/landing";

export interface LandingNavLink {
  label: string;
  /** Lucide icon name; empty when the admin chose no icon for a content section. */
  icon?: string;
  to?: string;
  href?: string;
}

export interface LandingNavAction {
  label: string;
  icon: string;
  to?: string;
  href?: string;
}

export interface UseLandingNavOptions {
  organization: MaybeRefOrGetter<any>;
  slug: MaybeRefOrGetter<string>;
  user?: MaybeRefOrGetter<any>;
  hasAmenities?: MaybeRefOrGetter<boolean | undefined>;
  hasListings?: MaybeRefOrGetter<boolean | undefined>;
  hasFaq?: MaybeRefOrGetter<boolean | undefined>;
}

// Resident-portal sections, shown LOCKED. Filtered to the modules the org has
// enabled (missing/null = enabled, mirroring useModules). Home is always shown.
const PORTAL: Array<{ label: string; icon: string; key: string }> = [
  { label: "Dashboard", icon: "lucide:layout-dashboard", key: "home" },
  { label: "Announcements", icon: "lucide:megaphone", key: "announcements" },
  { label: "Documents", icon: "lucide:file-text", key: "documents" },
  { label: "Meetings", icon: "lucide:calendar-days", key: "meetings" },
  { label: "Payments", icon: "lucide:credit-card", key: "payments" },
  { label: "Requests", icon: "lucide:clipboard-list", key: "requests" },
  { label: "Rules", icon: "lucide:scale", key: "rules" },
  { label: "Polls", icon: "lucide:bar-chart-3", key: "polls" },
  { label: "Directory", icon: "lucide:users-round", key: "directory" },
];

export function useLandingNav(opts: UseLandingNavOptions) {
  const organization = computed(() => toValue(opts.organization));
  const slug = computed(() => toValue(opts.slug));
  const user = computed(() => toValue(opts.user));
  const isSignedIn = computed(() => !!user.value);
  const memberNoun = computed(() => orgMemberNoun(organization.value?.type));

  // Locked portal links send logged-out visitors to login, logged-in non-members
  // to request access.
  const lockHref = computed(() => (isSignedIn.value ? `/${slug.value}/request-join` : "/auth/login"));

  // Public landing anchors — built FROM the admin's ordered block list so the
  // nav mirrors the page (including custom content sections). Each built-in
  // anchor only shows when its data is present; content anchors need a label.
  const landingCfg = computed(() => normalizeLandingConfig(organization.value?.settings?.landing));
  const amenitiesPresent = computed(
    () =>
      (Array.isArray(organization.value?.amenities) && organization.value.amenities.length > 0) ||
      !!toValue(opts.hasAmenities)
  );
  const exploreLinks = computed<LandingNavLink[]>(() => {
    const out: LandingNavLink[] = [{ label: "Home", icon: "lucide:home", href: "#top" }];
    for (const b of enabledLandingBlocks(landingCfg.value)) {
      if (b.type === "amenities" && amenitiesPresent.value)
        out.push({ label: "Amenities", icon: "lucide:concierge-bell", href: "#amenities" });
      else if (b.type === "listings" && landingCfg.value.listings.length)
        out.push({ label: "Listings", icon: "lucide:home", href: "#listings" });
      else if (b.type === "faq" && landingCfg.value.faq.length)
        out.push({ label: "FAQ", icon: "lucide:circle-help", href: "#faq" });
      else if (b.type === "board" && organization.value?.show_board !== false)
        out.push({ label: "Board", icon: "lucide:users", to: `/${slug.value}/board` });
      else if (b.type === "contact")
        out.push({ label: "Contact", icon: "lucide:mail", href: "#contact" });
      else if (b.type === "content" && (b.title || b.category) && b.show_in_menu !== false)
        out.push({ label: (b.category || b.title) as string, icon: b.menu_icon || "lucide:layout-template", href: `#${b.id}` });
    }
    return out;
  });

  const moduleOn = (key: string): boolean => {
    if (key === "home" || key === "dashboard") return true;
    const m = organization.value?.modules;
    if (!m || typeof m !== "object") return true;
    const v = m[key];
    return v === undefined || v === null ? true : v !== false;
  };
  const portalLinks = computed(() => PORTAL.filter((p) => moduleOn(p.key)));

  // The sentence under the locked portal group.
  const portalIntro = computed(() => {
    const plural = memberNoun.value.plural.toLowerCase();
    return isSignedIn.value
      ? `Request access to unlock the full ${plural} portal — documents, payments, meetings and more.`
      : `Sign in to unlock the full ${plural} portal — documents, payments, meetings and more.`;
  });

  // Primary CTA: signed-in → portal/dashboard; else → login.
  const primaryAction = computed<LandingNavAction>(() =>
    isSignedIn.value
      ? { label: `${memberNoun.value.singular} portal`, icon: "lucide:layout-dashboard", href: "/dashboard" }
      : { label: `${memberNoun.value.singular} login`, icon: "lucide:log-in", href: "/auth/login" }
  );

  // Secondary CTAs, only for logged-out visitors.
  const accessActions = computed<LandingNavAction[]>(() =>
    isSignedIn.value
      ? []
      : [
          { label: "Request access", icon: "lucide:key-round", to: `/${slug.value}/request-join` },
          { label: "Create account", icon: "lucide:user-plus", to: `/${slug.value}/signup` },
        ]
  );

  return {
    organization,
    slug,
    user,
    isSignedIn,
    memberNoun,
    lockHref,
    exploreLinks,
    portalLinks,
    portalIntro,
    primaryAction,
    accessActions,
  };
}

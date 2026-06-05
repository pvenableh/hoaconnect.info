<script setup lang="ts">
// Slim breadcrumb row beneath the header: org home → section → page.
// Section names come from the dock app definitions where the route matches one,
// otherwise the path segment is humanized. Hidden on the org home / dashboard
// root (where it would collapse to a single crumb).
const route = useRoute();
const { orgSlug, buildOrgPath } = useOrgNavigation();
const { appsFor, activeKeyFor } = useAppNav();
const { pageWide, setPageWide } = usePageWidth();

// Reset to the standard width on every navigation; the destination page's
// PageContainer re-flags `wide` if needed. This keeps the row aligned even on
// pages that render their own container instead of <PageContainer>.
watch(
  () => route.path,
  () => setPageWide(false)
);

const humanize = (s: string) => s.replace(/-/g, " ");

// Find the dock app whose match fragments cover the current route (admin first,
// then member), so we can reuse its human label for the section crumb.
const sectionApp = computed(() => {
  const admin = appsFor(true);
  const k1 = activeKeyFor(admin);
  if (k1) return admin.find((a) => a.key === k1) || null;
  const member = appsFor(false);
  const k2 = activeKeyFor(member);
  if (k2) return member.find((a) => a.key === k2) || null;
  return null;
});

interface Crumb {
  label: string;
  to: string | null;
}

const crumbs = computed<Crumb[]>(() => {
  const slug = orgSlug.value;
  if (!slug) return [];

  const rel = route.path.replace(new RegExp(`^/${slug}`), "") || "/";
  const segs = rel.split("/").filter(Boolean);

  const out: Crumb[] = [{ label: "Home", to: `/${slug}` }];

  const app = sectionApp.value;
  // Root pages (member home / admin dashboard) collapse to just Home → hidden.
  const onRoot =
    segs.length === 0 ||
    (!!app && (app.key === "home" || app.key === "dashboard") && segs.length <= 1);

  if (!onRoot) {
    if (app) {
      out.push({ label: app.label, to: buildOrgPath(app.path) });
    } else {
      // No dock app — humanize the leading section segment (skip the admin prefix)
      const i = segs[0] === "admin" ? 1 : 0;
      const seg = segs[i];
      if (seg) {
        out.push({
          label: humanize(seg),
          to: buildOrgPath("/" + segs.slice(0, i + 1).join("/")),
        });
      }
    }

    // Trailing page crumb for detail pages: the last segment, unless it's an id
    // or simply repeats the section terminal.
    const last = segs[segs.length - 1];
    const isId =
      !!last && (/^[0-9a-f]{8}-/i.test(last) || /^\d+$/.test(last));
    const sectionPath = app
      ? app.path
      : "/" + (segs[0] === "admin" ? segs[1] : segs[0]);
    const sectionTerminal = sectionPath.split("/").filter(Boolean).pop();
    if (last && !isId && last !== sectionTerminal) {
      out.push({ label: humanize(last), to: null });
    }
  }

  return out;
});
</script>

<template>
  <div v-if="crumbs.length > 1" class="t-bg-elevated border-b t-border">
    <nav
      :class="[
        'mx-auto w-full px-4 sm:px-6 py-2 flex items-center gap-1.5 text-[11px] uppercase tracking-widest t-text-muted',
        pageWide ? 'max-w-7xl' : 'max-w-6xl',
      ]"
      aria-label="Breadcrumb"
    >
      <template v-for="(c, i) in crumbs" :key="i">
        <Icon
          v-if="i > 0"
          name="lucide:chevron-right"
          class="w-3 h-3 shrink-0"
        />
        <NuxtLink
          v-if="c.to"
          :to="c.to"
          class="hover:t-text transition-colors whitespace-nowrap"
        >
          {{ c.label }}
        </NuxtLink>
        <span v-else class="t-text whitespace-nowrap">{{ c.label }}</span>
      </template>
    </nav>
  </div>
</template>

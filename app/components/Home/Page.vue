<script setup lang="ts">
/**
 * HomePage — the three bands every role's home is made of
 * (docs/plan-unified-experience.md §5): Needs you, At a glance, What's new.
 *
 * Which content each band holds comes from `homeFor(roleContext)`; this shell
 * only places it. Each band is a slot that receives its content keys, so a role
 * page (Sessions 8 and 9) maps keys to components without touching the layout.
 * Until a page fills a band, Needs you falls back to the stacks and At a glance
 * to the rail, which is today's admin home.
 */
import { homeFor, type HomeBands } from "#core/shared/home/roles";
import type { RoleContext } from "#core/shared/roles/role-context";

const props = defineProps<{
  /** The person's resolved context for this community. */
  roleContext: RoleContext | null | undefined;
  organizationId?: string | null;
}>();

const bands = computed<HomeBands>(() => homeFor(props.roleContext));
</script>

<template>
  <div class="home-page space-y-6" data-home-page :data-home-roles="bands.roles.join(' ')">
    <section v-if="bands.needs.length" aria-label="Needs you" data-home-band="needs">
      <slot name="needs" :keys="bands.needs" :acts="bands.acts">
        <HomeStacks :organization-id="organizationId" />
      </slot>
    </section>
    <section v-if="bands.glance.length" aria-label="At a glance" data-home-band="glance">
      <slot name="glance" :keys="bands.glance">
        <HomeGlanceRail />
      </slot>
    </section>
    <section aria-label="What's new" data-home-band="feed">
      <slot name="feed" :feed="bands.feed" />
    </section>
  </div>
</template>

<!--
  AppResourceRecordPage — one record as a full page, for deep links
  (docs/spec-resource-scaffold.md). The SAME panel component the index opens
  as a slide-over, looked up in the panel registry and rendered with `page`
  set, so `AppSlideOverShell` draws `AppPageHeader` with a back link to the
  index instead of its slide-over header.

  The route file that mounts this carries its index's middleware; the panel
  reads through the same gated route the index does.
-->
<script setup lang="ts">
import { getPanelComponent, getPanelEntry } from "~/components/panels/registry";

const props = defineProps<{ type: string; id: string }>();

const { buildOrgPath } = useOrgNavigation();
const entry = computed(() => getPanelEntry(props.type));
const component = computed(() => getPanelComponent(props.type));
const back = computed(() => buildOrgPath(entry.value?.index ?? "/"));
</script>

<template>
  <div class="min-h-screen t-bg t-text t-transition">
    <PageContainer class="max-w-2xl">
      <component :is="component" v-if="component" :id="id" :page="back" @close="navigateTo(back)" />
    </PageContainer>
  </div>
</template>

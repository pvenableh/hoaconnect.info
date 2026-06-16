<!-- Community size widget — count from the org record, labelled per org type
     (residential -> Households, commercial -> Members). -->
<template>
  <LandingWidgetShell
    v-if="count > 0"
    :value="count"
    :label="count === 1 ? label.singular : label.plural"
    icon="lucide:building-2"
    sub="In the community"
  />
</template>

<script setup lang="ts">
import LandingWidgetShell from "./LandingWidgetShell.vue";
import { orgMemberLabel, type OrgType } from "#core/shared/utils/terminology";

const props = defineProps<{ count?: number | null; type?: OrgType }>();
const count = computed(() => Number(props.count) || 0);
const label = computed(() => orgMemberLabel(props.type));
</script>

<script setup lang="ts">
import { VisDonut, VisSingleContainer, VisTooltip } from "@unovis/vue"
import { Donut } from "@unovis/ts"
import { ChartContainer, ChartTooltipContent, componentToString, type ChartConfig } from "~/components/ui/chart"

interface MembershipData {
  type: string
  count: number
  fill: string
}

const props = defineProps<{
  owners: number
  tenants: number
}>()

const data = computed<MembershipData[]>(() => [
  { type: "Owners", count: props.owners, fill: "hsl(var(--chart-1))" },
  { type: "Tenants", count: props.tenants, fill: "hsl(var(--chart-2))" },
])

const total = computed(() => props.owners + props.tenants)

const chartConfig: ChartConfig = {
  owners: {
    label: "Owners",
    color: "hsl(var(--chart-1))",
  },
  tenants: {
    label: "Tenants",
    color: "hsl(var(--chart-2))",
  },
}

const value = (d: MembershipData) => d.count
const color = (d: MembershipData) => d.fill
</script>

<template>
  <Card>
    <CardHeader class="pb-2">
      <CardTitle class="text-base">Owners vs Tenants</CardTitle>
      <CardDescription>Community composition</CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer :config="chartConfig" class="mx-auto aspect-square h-[200px]">
        <VisSingleContainer :data="data">
          <VisDonut
            :value="value"
            :color="color"
            :arcWidth="40"
            :padAngle="0.02"
            :cornerRadius="4"
          />
          <VisTooltip>
            <template #default="{ data: tooltipData }">
              <div v-if="tooltipData" class="bg-background border rounded-lg p-2 shadow-lg text-sm">
                <div class="font-medium">{{ tooltipData.type }}</div>
                <div class="text-muted-foreground">
                  {{ tooltipData.count }} members
                  ({{ Math.round((tooltipData.count / total) * 100) }}%)
                </div>
              </div>
            </template>
          </VisTooltip>
        </VisSingleContainer>
      </ChartContainer>
      <div class="flex justify-center gap-4 mt-2">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-[hsl(var(--chart-1))]" />
          <span class="text-sm text-muted-foreground">Owners ({{ owners }})</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-[hsl(var(--chart-2))]" />
          <span class="text-sm text-muted-foreground">Tenants ({{ tenants }})</span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

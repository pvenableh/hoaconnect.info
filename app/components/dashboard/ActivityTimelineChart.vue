<script setup lang="ts">
import { VisXYContainer, VisStackedBar, VisAxis } from "@unovis/vue"
import { ChartContainer, type ChartConfig } from "~/components/ui/chart"

interface ActivityData {
  date: string
  documents: number
  emails: number
  members: number
}

const props = defineProps<{
  data: ActivityData[]
}>()

const chartConfig: ChartConfig = {
  documents: {
    label: "Documents",
    color: "hsl(var(--chart-1))",
  },
  emails: {
    label: "Emails",
    color: "hsl(var(--chart-2))",
  },
  members: {
    label: "New Members",
    color: "hsl(var(--chart-3))",
  },
}

const x = (_: ActivityData, i: number) => i
const y = [
  (d: ActivityData) => d.documents,
  (d: ActivityData) => d.emails,
  (d: ActivityData) => d.members,
]
const color = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))"]

const tickFormat = (i: number) => {
  const item = props.data[i]
  if (!item) return ""
  return new Date(item.date).toLocaleDateString("en-US", { weekday: "short" })
}
</script>

<template>
  <Card>
    <CardHeader class="pb-2">
      <CardTitle class="text-base">Weekly Activity</CardTitle>
      <CardDescription>Activity breakdown by day</CardDescription>
    </CardHeader>
    <CardContent>
      <ChartContainer :config="chartConfig" class="h-[200px] w-full">
        <VisXYContainer :data="data">
          <VisStackedBar
            :x="x"
            :y="y"
            :color="color"
            :roundedCorners="4"
            :barPadding="0.3"
          />
          <VisAxis
            type="x"
            :tickFormat="tickFormat"
            :gridLine="false"
          />
          <VisAxis
            type="y"
            :gridLine="true"
          />
        </VisXYContainer>
      </ChartContainer>
      <div class="flex justify-center gap-4 mt-2">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-[hsl(var(--chart-1))]" />
          <span class="text-sm text-muted-foreground">Documents</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-[hsl(var(--chart-2))]" />
          <span class="text-sm text-muted-foreground">Emails</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-[hsl(var(--chart-3))]" />
          <span class="text-sm text-muted-foreground">New Members</span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

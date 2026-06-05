<script setup lang="ts">
import { VisXYContainer, VisLine, VisAxis, VisArea, VisCrosshair, VisTooltip } from "@unovis/vue"
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "~/components/ui/chart"

interface EmailData {
  date: string
  sent: number
  delivered: number
  opened: number
}

const props = defineProps<{
  data: EmailData[]
}>()

const chartConfig: ChartConfig = {
  sent: {
    label: "Sent",
    color: "var(--chart-1)",
  },
  delivered: {
    label: "Delivered",
    color: "var(--chart-2)",
  },
  opened: {
    label: "Opened",
    color: "var(--chart-3)",
  },
}

const x = (_: EmailData, i: number) => i
const y = [
  (d: EmailData) => d.sent,
  (d: EmailData) => d.delivered,
  (d: EmailData) => d.opened,
]
const color = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"]

const tickFormat = (i: number) => {
  const item = props.data[i]
  if (!item) return ""
  return new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
</script>

<template>
  <Card>
    <CardHeader class="pb-2">
      <CardTitle class="text-base">Email Activity</CardTitle>
      <CardDescription>Last 7 days email performance</CardDescription>
    </CardHeader>
    <CardContent>
      <!-- unovis is not SSR-safe: rendered server-side it leaves an empty
           duplicate <svg>, so the real chart stacks below the card. Render
           client-only with a height-reserving fallback to avoid layout shift. -->
      <ClientOnly>
        <ChartContainer :config="chartConfig" class="h-[200px] w-full">
          <VisXYContainer :data="data" :margin="{ top: 8, right: 12, bottom: 24, left: 40 }">
            <VisLine
              :x="x"
              :y="y"
              :color="color"
              :lineWidth="2"
              :curveType="'linear'"
            />
            <VisArea
              :x="x"
              :y="y"
              :color="color"
              :opacity="0.1"
              :curveType="'linear'"
            />
            <VisAxis
              type="x"
              :tickFormat="tickFormat"
              :numTicks="7"
              :gridLine="false"
            />
            <VisAxis
              type="y"
              :gridLine="true"
            />
            <VisCrosshair
              :template="(d: EmailData) => `Sent: ${d.sent}, Delivered: ${d.delivered}, Opened: ${d.opened}`"
            />
          </VisXYContainer>
        </ChartContainer>
        <template #fallback>
          <div class="h-[200px] w-full" />
        </template>
      </ClientOnly>
      <div class="flex justify-center gap-4 mt-2">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-[var(--chart-1)]" />
          <span class="text-xs text-muted-foreground">Sent</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-[var(--chart-2)]" />
          <span class="text-xs text-muted-foreground">Delivered</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-[var(--chart-3)]" />
          <span class="text-xs text-muted-foreground">Opened</span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

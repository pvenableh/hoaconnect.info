<script setup lang="ts">
import { VisXYContainer, VisGroupedBar, VisAxis } from "@unovis/vue"
import { ChartContainer, type ChartConfig } from "~/components/ui/chart"

interface ChannelData {
  name: string
  messages: number
  members: number
}

const props = defineProps<{
  data: ChannelData[]
}>()

const chartConfig: ChartConfig = {
  messages: {
    label: "Messages",
    color: "var(--chart-1)",
  },
  members: {
    label: "Members",
    color: "var(--chart-2)",
  },
}

const x = (_: ChannelData, i: number) => i
const y = [
  (d: ChannelData) => d.messages,
  (d: ChannelData) => d.members,
]
const color = ["var(--chart-1)", "var(--chart-2)"]

const tickFormat = (i: number) => {
  const item = props.data[i]
  return item?.name || ""
}
</script>

<template>
  <Card>
    <CardHeader class="pb-2">
      <CardTitle class="text-base">Channel Activity</CardTitle>
      <CardDescription>Messages and members by channel</CardDescription>
    </CardHeader>
    <CardContent>
      <!-- unovis is not SSR-safe (and this data is client-only); render
           client-only with a height-reserving fallback to avoid layout shift. -->
      <ClientOnly>
        <ChartContainer :config="chartConfig" class="h-[200px] w-full">
          <VisXYContainer :data="data" :margin="{ top: 8, right: 12, bottom: 28, left: 40 }">
            <VisGroupedBar
              :x="x"
              :y="y"
              :color="color"
              :roundedCorners="4"
              :barPadding="0.2"
              :groupPadding="0.1"
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
        <template #fallback>
          <div class="h-[200px] w-full" />
        </template>
      </ClientOnly>
      <div class="flex justify-center gap-4 mt-2">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-[var(--chart-1)]" />
          <span class="text-xs text-muted-foreground">Messages</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-[var(--chart-2)]" />
          <span class="text-xs text-muted-foreground">Members</span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

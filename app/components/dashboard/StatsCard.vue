<script setup lang="ts">
defineProps<{
  title: string
  value: number | string
  description?: string
  icon?: string
  trend?: {
    value: number
    positive: boolean
  }
}>()
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle class="text-sm font-medium">{{ title }}</CardTitle>
      <Icon v-if="icon" :name="icon" class="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div class="text-2xl font-bold">{{ value }}</div>
      <p v-if="description" class="text-xs text-muted-foreground">
        {{ description }}
      </p>
      <div v-if="trend" class="flex items-center text-xs mt-1">
        <Icon
          :name="trend.positive ? 'heroicons:arrow-trending-up' : 'heroicons:arrow-trending-down'"
          :class="[
            'h-3 w-3 mr-1',
            trend.positive ? 'text-green-500' : 'text-red-500'
          ]"
        />
        <span :class="trend.positive ? 'text-green-500' : 'text-red-500'">
          {{ trend.positive ? '+' : '' }}{{ trend.value }}%
        </span>
        <span class="text-muted-foreground ml-1">from last month</span>
      </div>
    </CardContent>
  </Card>
</template>

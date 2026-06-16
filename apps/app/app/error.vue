<template>
  <div class="min-h-screen flex items-center justify-center bg-stone-50">
    <div class="text-center max-w-md mx-auto px-6">
      <div class="mb-8">
        <Icon
          name="lucide:alert-triangle"
          class="w-16 h-16 text-stone-400 mx-auto mb-4"
        />
        <h1 class="text-4xl text-sophisticated text-stone-900 mb-4">
          {{ error.statusCode || "Error" }}
        </h1>
        <p class="text-xl text-elegant text-stone-600 mb-6">
          {{ error.statusMessage || "Something went wrong" }}
        </p>
      </div>

      <div class="space-y-4">
        <Button @click="handleError" size="lg">
          <Icon name="lucide:home" class="w-4 h-4 mr-2" />
          Go Home
        </Button>

        <Button @click="refresh" variant="outline" size="lg">
          <Icon name="lucide:refresh-cw" class="w-4 h-4 mr-2" />
          Try Again
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Button } from "@/components/ui/button";

const props = defineProps({
  error: Object,
});

const handleError = () => clearError({ redirect: "/" });
const refresh = () => clearError();

// useHead({
//   title: `Error ${props.error?.statusCode || ""} - Portfolio`,
// });
</script>

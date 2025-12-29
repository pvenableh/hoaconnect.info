<script setup lang="ts">
definePageMeta({
  layout: false,
  auth: false,
});

useHead({
  title: 'Test Email Preview',
});
</script>

<template>
  <div class="min-h-screen bg-stone-50 flex items-center justify-center p-4">
    <div class="max-w-md w-full">
      <!-- Card -->
      <div class="bg-white rounded-2xl shadow-lg border border-stone-200 overflow-hidden">
        <!-- Header with icon -->
        <div class="p-8 text-center bg-blue-50 border-blue-200 border-b">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white shadow-sm mb-4">
            <Icon name="i-lucide-mail-check" class="w-8 h-8 text-blue-500" />
          </div>
          <h1 class="text-2xl font-bold text-stone-900">
            Test Email Preview
          </h1>
        </div>

        <!-- Content -->
        <div class="p-8">
          <p class="text-stone-600 text-center mb-6">
            This is a placeholder page for test emails. When you send a test email, the "View in Browser" link points here to demonstrate how the link will work.
          </p>

          <div class="bg-stone-50 rounded-lg p-4 mb-6">
            <p class="text-sm font-medium text-stone-700 mb-3">How it works:</p>
            <ul class="space-y-2">
              <li class="flex items-start gap-2 text-sm text-stone-600">
                <Icon name="i-lucide-info" class="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                Test emails don't have a stored version to display
              </li>
              <li class="flex items-start gap-2 text-sm text-stone-600">
                <Icon name="i-lucide-send" class="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                When you send the actual email, recipients will see the full content
              </li>
              <li class="flex items-start gap-2 text-sm text-stone-600">
                <Icon name="i-lucide-eye" class="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                The real "View in Browser" link will show the complete email
              </li>
            </ul>
          </div>

          <p class="text-xs text-stone-500 text-center">
            You can close this page and return to composing your email.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

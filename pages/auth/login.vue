<script setup lang="ts">
definePageMeta({
  middleware: 'guest',
  layout: 'auth'
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <AuthLoginForm 
      redirect-to="/"
      :show-o-auth="true"
    />
  </div>
</template>
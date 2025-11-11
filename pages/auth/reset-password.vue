<script setup lang="ts">
const route = useRoute()
const token = route.query.token as string

if (!token) {
  throw createError({
    statusCode: 400,
    message: 'Invalid reset token'
  })
}

definePageMeta({
  middleware: 'guest',
  layout: 'auth'
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <AuthPasswordResetForm 
      :token="token"
      redirect-to="/login"
    />
  </div>
</template>
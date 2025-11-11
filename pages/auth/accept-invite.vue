<script setup lang="ts">
const route = useRoute()
const token = route.query.token as string

if (!token) {
  throw createError({
    statusCode: 400,
    message: 'Invalid invitation token'
  })
}

definePageMeta({
  middleware: 'guest',
  layout: 'auth'
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-4">
    <AuthAcceptInviteForm 
      :token="token"
      redirect-to="/"
    />
  </div>
</template>
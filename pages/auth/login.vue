<!-- pages/auth/login.vue -->
<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 sm:px-6 lg:px-8">
    <div class="w-full max-w-md">
      <!-- Logo/Brand -->
      <div class="text-center mb-8">
        <h1 v-if="activeHoa" class="text-3xl font-bold text-gray-900 mb-2">
          {{ activeHoa.name }}
        </h1>
        <h2 v-else class="text-3xl font-bold text-gray-900 mb-2">
          HOA Connect
        </h2>
        <p class="text-gray-600">
          {{ activeHoa ? 'Member Portal' : 'Homeowner Association Management' }}
        </p>
      </div>

      <!-- Login Form -->
      <AuthLoginForm @success="handleLoginSuccess" />

      <!-- Additional Links -->
      <div class="mt-6 text-center text-sm text-gray-600">
        <p>
          Need help?
          <NuxtLink to="/support" class="font-medium text-blue-600 hover:text-blue-500">
            Contact support
          </NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Page meta
definePageMeta({
  layout: 'auth',
  middleware: 'auth'
})

// Composables
const { activeHoa } = useActiveHoa()
const router = useRouter()
const route = useRoute()

// Handle successful login
const handleLoginSuccess = (user: any) => {
  // Check for redirect URL in query params
  const redirectTo = route.query.redirect as string || '/dashboard'
  
  // Navigate to redirect URL or dashboard
  router.push(redirectTo)
}

// Set page title
useHead({
  title: activeHoa.value ? `Sign In - ${activeHoa.value.name}` : 'Sign In - HOA Connect'
})
</script>

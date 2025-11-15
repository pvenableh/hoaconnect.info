<!-- pages/auth/register.vue -->
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
          {{ activeHoa ? 'Create your member account' : 'Start managing your HOA today' }}
        </p>
      </div>

      <!-- Registration Form -->
      <AuthRegisterForm @success="handleRegisterSuccess" />

      <!-- Additional Links -->
      <div class="mt-6 text-center text-sm text-gray-600">
        <p>
          By registering, you agree to our
        </p>
        <p>
          <NuxtLink to="/terms" class="font-medium text-blue-600 hover:text-blue-500">
            Terms of Service
          </NuxtLink>
          and
          <NuxtLink to="/privacy" class="font-medium text-blue-600 hover:text-blue-500">
            Privacy Policy
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

// Handle successful registration
const handleRegisterSuccess = (user: any) => {
  // Navigate to onboarding or dashboard
  if (!user.profile?.onboarding_completed) {
    router.push('/dashboard/onboarding')
  } else {
    router.push('/dashboard')
  }
}

// Set page title
useHead({
  title: activeHoa.value ? `Sign Up - ${activeHoa.value.name}` : 'Sign Up - HOA Connect'
})
</script>

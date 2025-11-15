<template>
  <div class="container flex h-screen w-screen flex-col items-center justify-center">
    <div class="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
      <!-- Logo/Brand -->
      <div class="flex flex-col space-y-2 text-center">
        <Icon name="lucide:shield" class="mx-auto h-12 w-12 text-primary" />
        <h1 class="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p class="text-sm text-muted-foreground">
          Enter your email to sign in to your account
        </p>
      </div>

      <!-- Login Form -->
      <UiCard>
        <UiCardHeader>
          <UiCardTitle>Sign In</UiCardTitle>
          <UiCardDescription>
            Enter your credentials to access your account
          </UiCardDescription>
        </UiCardHeader>
        <UiCardContent>
          <form @submit="onSubmit" class="space-y-4">
            <!-- Email Field -->
            <div class="space-y-2">
              <UiLabel for="email">Email</UiLabel>
              <UiInput
                id="email"
                v-model="email"
                type="email"
                placeholder="you@example.com"
                :error="!!errors.email"
                :disabled="isSubmitting"
              />
              <p v-if="errors.email" class="text-sm text-destructive">
                {{ errors.email }}
              </p>
            </div>

            <!-- Password Field -->
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <UiLabel for="password">Password</UiLabel>
                <NuxtLink 
                  to="/auth/forgot-password" 
                  class="text-sm text-primary hover:underline"
                >
                  Forgot password?
                </NuxtLink>
              </div>
              <UiInput
                id="password"
                v-model="password"
                type="password"
                placeholder="••••••••"
                :error="!!errors.password"
                :disabled="isSubmitting"
              />
              <p v-if="errors.password" class="text-sm text-destructive">
                {{ errors.password }}
              </p>
            </div>

            <!-- Error Alert -->
            <UiAlert v-if="authError" variant="destructive">
              <Icon name="lucide:alert-circle" class="h-4 w-4" />
              <div class="ml-2">{{ authError }}</div>
            </UiAlert>

            <!-- Submit Button -->
            <UiButton
              type="submit"
              class="w-full"
              :disabled="isSubmitting"
            >
              <Icon v-if="isSubmitting" name="lucide:loader-2" class="mr-2 h-4 w-4 animate-spin" />
              {{ isSubmitting ? 'Signing in...' : 'Sign In' }}
            </UiButton>
          </form>

          <!-- Divider -->
          <div class="relative my-6">
            <div class="absolute inset-0 flex items-center">
              <span class="w-full border-t" />
            </div>
            <div class="relative flex justify-center text-xs uppercase">
              <span class="bg-card px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <!-- OAuth Buttons -->
          <div class="grid grid-cols-2 gap-4">
            <UiButton variant="outline" @click="loginWithGitHub">
              <Icon name="lucide:github" class="mr-2 h-4 w-4" />
              GitHub
            </UiButton>
            <UiButton variant="outline" @click="loginWithGoogle">
              <Icon name="lucide:mail" class="mr-2 h-4 w-4" />
              Google
            </UiButton>
          </div>
        </UiCardContent>
      </UiCard>

      <!-- Sign Up Link -->
      <p class="px-8 text-center text-sm text-muted-foreground">
        Don't have an account?
        <NuxtLink to="/auth/register" class="hover:text-primary underline underline-offset-4">
          Sign up
        </NuxtLink>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { loginSchema, type LoginSchema } from '~/lib/validations'
import { toast } from 'vue-sonner'

definePageMeta({
  layout: false,
  middleware: 'guest'
})

const { login } = useDirectusAuth()
const router = useRouter()
const route = useRoute()

// Get redirect URL from query params
const redirectTo = computed(() => route.query.redirect as string || '/dashboard')

// Form validation
const { handleSubmit, errors, isSubmitting, defineField } = useForm<LoginSchema>({
  validationSchema: toTypedSchema(loginSchema)
})

const [email] = defineField('email')
const [password] = defineField('password')

// Auth error state
const authError = ref<string | null>(null)

// Handle form submission
const onSubmit = handleSubmit(async (values) => {
  authError.value = null
  
  try {
    await login(values.email, values.password)
    toast.success('Successfully logged in!')
    await router.push(redirectTo.value)
  } catch (error: any) {
    authError.value = error?.message || 'Invalid email or password'
  }
})

// OAuth login methods
const loginWithGitHub = () => {
  window.location.href = '/api/auth/github'
}

const loginWithGoogle = () => {
  window.location.href = '/api/auth/google'
}

// Page metadata
useHead({
  title: 'Sign In'
})
</script>


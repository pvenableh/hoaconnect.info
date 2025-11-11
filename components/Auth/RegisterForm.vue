<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { toast } from 'vue-sonner'
import { registerSchema, type RegisterSchema } from '~/schemas/auth'

interface Props {
  title?: string
  description?: string
  redirectTo?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Create an account',
  description: 'Enter your information to get started',
  redirectTo: '/login',
})

const emit = defineEmits<{
  success: [user: any]
  error: [error: Error]
}>()

const { register } = useDirectusAuth()
const router = useRouter()

const loading = ref(false)
const {
  formRef,
  animateError,
  animateValidationError,
  animateSuccess,
  animateButtonLoading,
  resetButtonLoading
} = useFormAnimations()

const form = useForm({
  validationSchema: toTypedSchema(registerSchema),
  initialValues: {
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
  },
})

watch(() => form.errors.value, (errors) => {
  Object.keys(errors).forEach(fieldName => {
    if (errors[fieldName]) {
      animateValidationError(fieldName)
    }
  })
})

const onSubmit = form.handleSubmit(async (values: RegisterSchema) => {
  loading.value = true
  const submitBtn = document.querySelector('.submit-button')
  if (submitBtn) {
    animateButtonLoading(submitBtn as HTMLElement)
  }

  try {
    const result = await register({
      email: values.email,
      password: values.password,
      firstName: values.firstName,
      lastName: values.lastName,
    })
    
    if (submitBtn) {
      animateSuccess(submitBtn as HTMLElement)
    }
    
    toast.success('Account created!', {
      description: 'Please log in with your new credentials.'
    })
    
    emit('success', result.user)
    await router.push(props.redirectTo)
  } catch (err: any) {
    const errorMessage = err.message || 'Registration failed. Please try again.'
    
    if (formRef.value) {
      animateError(formRef.value)
    }
    
    toast.error('Registration failed', {
      description: errorMessage
    })
    
    emit('error', err)
  } finally {
    loading.value = false
    if (submitBtn) {
      resetButtonLoading(submitBtn as HTMLElement)
    }
  }
})
</script>

<template>
  <Card ref="formRef" class="w-full max-w-md mx-auto">
    <CardHeader>
      <CardTitle>{{ title }}</CardTitle>
      <CardDescription>{{ description }}</CardDescription>
    </CardHeader>

    <CardContent>
      <form @submit="onSubmit" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <FormField v-slot="{ componentField }" name="firstName">
            <FormItem class="form-field">
              <FormLabel>First name</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  placeholder="John"
                  v-bind="componentField"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>

          <FormField v-slot="{ componentField }" name="lastName">
            <FormItem class="form-field">
              <FormLabel>Last name</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  placeholder="Doe"
                  v-bind="componentField"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>

        <FormField v-slot="{ componentField }" name="email">
          <FormItem class="form-field">
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input
                type="email"
                placeholder="name@example.com"
                v-bind="componentField"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="password">
          <FormItem class="form-field">
            <FormLabel>Password</FormLabel>
            <FormControl>
              <Input
                type="password"
                placeholder="••••••••"
                v-bind="componentField"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="confirmPassword">
          <FormItem class="form-field">
            <FormLabel>Confirm password</FormLabel>
            <FormControl>
              <Input
                type="password"
                placeholder="••••••••"
                v-bind="componentField"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <Button
          type="submit"
          class="w-full submit-button"
          :disabled="loading"
        >
          {{ loading ? 'Creating account...' : 'Create account' }}
        </Button>
      </form>
    </CardContent>

    <CardFooter class="flex justify-center">
      <p class="text-sm text-muted-foreground">
        Already have an account?
        <NuxtLink to="/auth/login" class="text-primary hover:underline">
          Sign in
        </NuxtLink>
      </p>
    </CardFooter>
  </Card>
</template>
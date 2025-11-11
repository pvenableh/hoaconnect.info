<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { toast } from 'vue-sonner'
import { acceptInviteSchema, type AcceptInviteSchema } from '~/schemas/auth'

interface Props {
  token: string
  title?: string
  description?: string
  redirectTo?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Accept invitation',
  description: 'Set up your account to get started',
  redirectTo: '/',
})

const emit = defineEmits<{
  success: [user: any]
  error: [error: Error]
}>()

const { acceptInvite } = useDirectusAuth()
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
  validationSchema: toTypedSchema(acceptInviteSchema),
  initialValues: {
    firstName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
  },
})

watch(() => form.errors.value, (errors) => {
  Object.keys(errors).forEach(fieldName => {
    if (errors[fieldName]) {
      animateValidationError(fieldName)
    }
  })
})

const onSubmit = form.handleSubmit(async (values: AcceptInviteSchema) => {
  loading.value = true
  const submitBtn = document.querySelector('.submit-button')
  if (submitBtn) {
    animateButtonLoading(submitBtn as HTMLElement)
  }

  try {
    const result = await acceptInvite(props.token, values.password)
    
    if (submitBtn) {
      animateSuccess(submitBtn as HTMLElement)
    }
    
    toast.success('Welcome aboard!', {
      description: 'Your account has been set up successfully.'
    })
    
    emit('success', result.user)
    await router.push(props.redirectTo)
  } catch (err: any) {
    const errorMessage = err.message || 'Failed to accept invitation. The link may be expired.'
    
    if (formRef.value) {
      animateError(formRef.value)
    }
    
    toast.error('Invitation failed', {
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
          {{ loading ? 'Setting up...' : 'Complete setup' }}
        </Button>
      </form>
    </CardContent>
  </Card>
</template>
<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { toast } from 'vue-sonner'
import { passwordResetSchema, type PasswordResetSchema } from '~/schemas/auth'

interface Props {
  token: string
  title?: string
  description?: string
  redirectTo?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Set new password',
  description: 'Enter your new password below',
  redirectTo: '/login',
})

const emit = defineEmits<{
  success: []
  error: [error: Error]
}>()

const { resetPassword } = useDirectusAuth()
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
  validationSchema: toTypedSchema(passwordResetSchema),
  initialValues: {
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

const onSubmit = form.handleSubmit(async (values: PasswordResetSchema) => {
  loading.value = true
  const submitBtn = document.querySelector('.submit-button')
  if (submitBtn) {
    animateButtonLoading(submitBtn as HTMLElement)
  }

  try {
    await resetPassword(props.token, values.password)
    
    if (submitBtn) {
      animateSuccess(submitBtn as HTMLElement)
    }
    
    toast.success('Password reset!', {
      description: 'Your password has been successfully reset.'
    })
    
    emit('success')
    await router.push(props.redirectTo)
  } catch (err: any) {
    const errorMessage = err.message || 'Failed to reset password. The link may be expired.'
    
    if (formRef.value) {
      animateError(formRef.value)
    }
    
    toast.error('Reset failed', {
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
        <FormField v-slot="{ componentField }" name="password">
          <FormItem class="form-field">
            <FormLabel>New password</FormLabel>
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
          {{ loading ? 'Resetting...' : 'Reset password' }}
        </Button>
      </form>
    </CardContent>
  </Card>
</template>
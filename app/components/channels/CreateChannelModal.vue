<script setup lang="ts">
import { z } from "zod";
import { toTypedSchema } from "@vee-validate/zod";
import { useForm } from "vee-validate";

const props = defineProps<{
  organizationId: string;
}>();

const emit = defineEmits<{
  (e: "created", channel: any): void;
  (e: "close"): void;
}>();

const isOpen = defineModel<boolean>("open", { default: false });

const { create: createChannel } = useDirectusItems("hoa_channels");
const isSubmitting = ref(false);

// Form validation schema
const channelSchema = toTypedSchema(
  z.object({
    name: z
      .string()
      .min(1, "Channel name is required")
      .max(50, "Channel name must be 50 characters or less")
      .regex(
        /^[a-z0-9-]+$/,
        "Channel name can only contain lowercase letters, numbers, and hyphens"
      ),
    description: z.string().max(200, "Description must be 200 characters or less").optional(),
    is_private: z.boolean().default(false),
    is_default: z.boolean().default(false),
  })
);

const { handleSubmit, resetForm, values, setFieldValue } = useForm({
  validationSchema: channelSchema,
  initialValues: {
    name: "",
    description: "",
    is_private: false,
    is_default: false,
  },
});

// Auto-generate slug from name
const slug = computed(() => {
  return values.name
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "";
});

const onSubmit = handleSubmit(async (formValues) => {
  isSubmitting.value = true;

  try {
    const channel = await createChannel({
      name: formValues.name,
      slug: slug.value,
      description: formValues.description || null,
      is_private: formValues.is_private,
      is_default: formValues.is_default,
      organization: props.organizationId,
      status: "published",
    });

    toast.success(`Channel #${formValues.name} created`);
    emit("created", channel);
    resetForm();
    isOpen.value = false;
  } catch (error: any) {
    console.error("Error creating channel:", error);
    toast.error(error.message || "Failed to create channel");
  } finally {
    isSubmitting.value = false;
  }
});

// Reset form when modal closes
watch(isOpen, (open) => {
  if (!open) {
    resetForm();
  }
});
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Create Channel</DialogTitle>
        <DialogDescription>
          Create a new channel for your organization to communicate.
        </DialogDescription>
      </DialogHeader>

      <form @submit.prevent="onSubmit" class="space-y-4">
        <!-- Channel Name -->
        <Field v-slot="{ field, errorMessage }" name="name">
          <FieldLabel>Channel Name</FieldLabel>
          <FieldContent>
            <div class="flex items-center">
              <span class="text-stone-500 mr-1">#</span>
              <Input
                v-bind="field"
                placeholder="general"
                class="flex-1"
                :disabled="isSubmitting"
              />
            </div>
          </FieldContent>
          <FieldError v-if="errorMessage">{{ errorMessage }}</FieldError>
          <FieldDescription>
            Lowercase letters, numbers, and hyphens only
          </FieldDescription>
        </Field>

        <!-- Description -->
        <Field v-slot="{ field, errorMessage }" name="description">
          <FieldLabel>Description (optional)</FieldLabel>
          <FieldContent>
            <Textarea
              v-bind="field"
              placeholder="What's this channel about?"
              :rows="2"
              :disabled="isSubmitting"
            />
          </FieldContent>
          <FieldError v-if="errorMessage">{{ errorMessage }}</FieldError>
        </Field>

        <!-- Private Channel Toggle -->
        <Field v-slot="{ field }" name="is_private">
          <div class="flex items-center justify-between">
            <div>
              <FieldLabel class="mb-0">Private Channel</FieldLabel>
              <FieldDescription class="text-xs">
                Only invited members can view and post
              </FieldDescription>
            </div>
            <Switch
              :checked="field.value"
              @update:checked="setFieldValue('is_private', $event)"
              :disabled="isSubmitting"
            />
          </div>
        </Field>

        <!-- Default Channel Toggle -->
        <Field v-slot="{ field }" name="is_default">
          <div class="flex items-center justify-between">
            <div>
              <FieldLabel class="mb-0">Default Channel</FieldLabel>
              <FieldDescription class="text-xs">
                New members automatically join this channel
              </FieldDescription>
            </div>
            <Switch
              :checked="field.value"
              @update:checked="setFieldValue('is_default', $event)"
              :disabled="isSubmitting || values.is_private"
            />
          </div>
        </Field>

        <DialogFooter class="gap-2">
          <Button
            type="button"
            variant="outline"
            @click="isOpen = false"
            :disabled="isSubmitting"
          >
            Cancel
          </Button>
          <Button type="submit" :disabled="isSubmitting">
            <Icon
              v-if="isSubmitting"
              name="lucide:loader-2"
              class="w-4 h-4 mr-1 animate-spin"
            />
            Create Channel
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

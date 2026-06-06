<!--
  Public inquiry CTA dialog. A visitor expresses interest (purchase / rental /
  general) and we POST to /api/hoa/public-inquiry, which stores it and notifies
  the admin-configured recipient. Controlled via v-model:open by the parent.
-->
<template>
  <Dialog :open="open" @update:open="(v) => emit('update:open', v)">
    <DialogContent class="sm:max-w-md rounded-3xl sm:rounded-3xl border t-border">
      <DialogHeader>
        <p class="landing-eyebrow mb-1">{{ organizationName || "Inquiries" }}</p>
        <DialogTitle class="landing-heading text-3xl">Get in touch</DialogTitle>
        <DialogDescription class="landing-lede">
          Tell us a little about what you're looking for and we'll be in touch.
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="submit">
        <!-- Category -->
        <div class="space-y-1.5">
          <Label>I'm interested in</Label>
          <div class="inline-flex rounded-lg border t-border p-0.5 w-full">
            <button
              v-for="opt in categories"
              :key="opt.value"
              type="button"
              class="flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              :class="form.category === opt.value ? 'bg-primary text-primary-foreground' : 't-text-muted hover:t-text'"
              @click="form.category = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <div class="space-y-1.5">
          <Label for="inq-name">Name</Label>
          <Input id="inq-name" v-model="form.name" required placeholder="Your name" />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <Label for="inq-email">Email</Label>
            <Input id="inq-email" v-model="form.email" type="email" required placeholder="you@example.com" />
          </div>
          <div class="space-y-1.5">
            <Label for="inq-phone">Phone <span class="t-text-muted">(optional)</span></Label>
            <Input id="inq-phone" v-model="form.phone" placeholder="(555) 555-5555" />
          </div>
        </div>
        <div class="space-y-1.5">
          <Label for="inq-message">Message</Label>
          <textarea
            id="inq-message"
            v-model="form.message"
            required
            rows="4"
            placeholder="How can we help?"
            class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <!-- Honeypot (hidden from humans) -->
        <input
          v-model="form.company"
          type="text"
          tabindex="-1"
          autocomplete="off"
          class="hidden"
          aria-hidden="true"
        />

        <DialogFooter class="gap-2">
          <Button type="button" variant="outline" :disabled="submitting" @click="emit('update:open', false)">
            Cancel
          </Button>
          <Button type="submit" :disabled="submitting">
            <Icon v-if="submitting" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
            Send inquiry
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { InquiryCategory } from "~~/shared/utils/landing";

const props = defineProps<{
  open: boolean;
  slug: string;
  organizationName?: string;
  defaultCategory?: InquiryCategory;
}>();
const emit = defineEmits<{ "update:open": [boolean] }>();

const categories: { value: InquiryCategory; label: string }[] = [
  { value: "sale", label: "Buying" },
  { value: "rental", label: "Renting" },
  { value: "general", label: "General" },
];

const blank = () => ({
  category: (props.defaultCategory || "general") as InquiryCategory,
  name: "",
  email: "",
  phone: "",
  message: "",
  company: "", // honeypot
});
const form = reactive(blank());
const submitting = ref(false);

// Reset the category default whenever the dialog is (re)opened.
watch(
  () => props.open,
  (o) => {
    if (o) form.category = props.defaultCategory || "general";
  }
);

const submit = async () => {
  submitting.value = true;
  try {
    await $fetch("/api/hoa/public-inquiry", {
      method: "POST",
      body: { slug: props.slug, ...form },
    });
    toast.success("Thanks — your inquiry has been sent.");
    Object.assign(form, blank());
    emit("update:open", false);
  } catch (e: any) {
    toast.error(e?.data?.message || e?.message || "Could not send your inquiry.");
  } finally {
    submitting.value = false;
  }
};
</script>

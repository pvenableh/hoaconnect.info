<script setup lang="ts">
/**
 * The one host for `useConfirm()` — mounted once in app.vue, next to the
 * Toaster. Nothing else should render this; call `useConfirm().confirm()`.
 *
 * Built on the glass `AlertDialog` (role="alertdialog", focus trapped, Esc and
 * Cancel both answer "no"). The action is a plain Button rather than
 * `AlertDialogAction`, because that part hard-codes the primary tier and a
 * destructive confirm must read as destructive.
 *
 * Focus lands on Cancel, not on the action: Enter on a destructive dialog that
 * opened under your hands should be the safe answer. A prompt is the exception:
 * focus lands in its field, since typing is what it asks for. Enter accepts a
 * one-line field; a multi-line one takes Ctrl/⌘+Enter.
 */
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { promptTextOk } from "#core/app/composables/useConfirm";

const { current, settle } = useConfirm();

// Held separately from `current` so the content stays rendered through the
// close animation instead of blanking the frame it starts.
const shown = ref<NonNullable<typeof current.value> | null>(null);
const text = ref("");
const fieldWrap = ref<HTMLElement | null>(null);

function focusField() {
  const el = fieldWrap.value?.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  if (!el) return false;
  el.focus();
  el.select();
  return true;
}

watch(
  current,
  (next, prev) => {
    if (!next) return;
    shown.value = next;
    text.value = next.field?.defaultValue ?? "";
    // A prompt that follows another dialog in the queue opens no new dialog,
    // so the open-focus hook below does not run for it.
    if (next.kind === "prompt" && prev) nextTick(focusField);
  },
  { immediate: true },
);

const open = computed({
  get: () => !!current.value,
  set: (v: boolean) => {
    if (!v && current.value) settle(current.value.id, false);
  },
});

const canAccept = computed(() => promptTextOk(shown.value?.field, text.value));

const accept = () => {
  if (!current.value || !canAccept.value) return;
  settle(current.value.id, true, current.value.kind === "prompt" ? text.value : undefined);
};

function onOpenFocus(e: Event) {
  if (shown.value?.kind !== "prompt") return;
  e.preventDefault();
  // reka-ui's AlertDialogContent focuses Cancel on a nextTick of its own,
  // queued after this handler; a task runs after every microtask, so the
  // field ends up with focus.
  setTimeout(focusField, 0);
}

function onFieldKeydown(e: KeyboardEvent) {
  if (e.key !== "Enter" || e.isComposing) return;
  if (shown.value?.field?.multiline && !(e.metaKey || e.ctrlKey)) return;
  e.preventDefault();
  accept();
}
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent v-if="shown" data-confirm-dialog class="sm:max-w-md" @open-auto-focus="onOpenFocus">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ shown.title }}</AlertDialogTitle>
        <AlertDialogDescription v-if="shown.body">{{ shown.body }}</AlertDialogDescription>
      </AlertDialogHeader>
      <div v-if="shown.field" ref="fieldWrap" class="space-y-2" data-confirm-field>
        <Label v-if="shown.field.label" :for="`confirm-field-${shown.id}`">{{ shown.field.label }}</Label>
        <Textarea
          v-if="shown.field.multiline"
          :id="`confirm-field-${shown.id}`"
          v-model="text"
          :placeholder="shown.field.placeholder"
          :maxlength="shown.field.maxLength"
          :aria-label="shown.field.label ? undefined : shown.title"
          rows="3"
          @keydown="onFieldKeydown"
        />
        <Input
          v-else
          :id="`confirm-field-${shown.id}`"
          v-model="text"
          :placeholder="shown.field.placeholder"
          :maxlength="shown.field.maxLength"
          :aria-label="shown.field.label ? undefined : shown.title"
          @keydown="onFieldKeydown"
        />
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel v-if="shown.kind !== 'alert'">{{ shown.cancelLabel }}</AlertDialogCancel>
        <Button
          :variant="shown.destructive ? 'destructive' : 'default'"
          :disabled="!canAccept"
          data-confirm-action
          @click="accept"
        >
          {{ shown.confirmLabel }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

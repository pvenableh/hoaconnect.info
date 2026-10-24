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
 * opened under your hands should be the safe answer.
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

const { current, settle } = useConfirm();

// Held separately from `current` so the content stays rendered through the
// close animation instead of blanking the frame it starts.
const shown = ref<NonNullable<typeof current.value> | null>(null);
watch(
  current,
  (next) => {
    if (next) shown.value = next;
  },
  { immediate: true },
);

const open = computed({
  get: () => !!current.value,
  set: (v: boolean) => {
    if (!v && current.value) settle(current.value.id, false);
  },
});

const accept = () => {
  if (current.value) settle(current.value.id, true);
};
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent v-if="shown" data-confirm-dialog class="sm:max-w-md">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ shown.title }}</AlertDialogTitle>
        <AlertDialogDescription v-if="shown.body">{{ shown.body }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel v-if="shown.kind === 'confirm'">{{ shown.cancelLabel }}</AlertDialogCancel>
        <Button
          :variant="shown.destructive ? 'destructive' : 'default'"
          data-confirm-action
          @click="accept"
        >
          {{ shown.confirmLabel }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script setup lang="ts">
// One operator-console action (docs/plan-operator-console.md §5, Phase 2): the
// action's own fields in the slot, a reason, a last confirmation through
// useConfirm(), then the POST. The server checks every rule again; this only
// says so sooner.
//
// `requestId` is made when the dialog opens and reused for retries, so a double
// click or a retry after a dropped response reaches Stripe with the same
// idempotency key and runs once. After an answer from the server (done or
// refused) the next submit gets a new one.
import { toast } from "vue-sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { REASON_MAX, reasonProblem } from "#core/shared/ops/actions";

const props = defineProps<{
  title: string;
  description?: string;
  endpoint: string;
  submitLabel: string;
  destructive?: boolean;
  /** The action's own fields, read at submit. */
  body?: () => Record<string, unknown>;
  /** What's wrong with those fields, or null. */
  problem?: () => string | null;
  /** The last question before it runs. */
  confirmation: () => { title: string; body?: string; confirmLabel?: string };
  /** The toast once it has run. */
  doneMessage?: (res: any) => string;
}>();
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ (e: "done", res: any): void }>();

const reason = ref("");
const requestId = ref("");
const busy = ref(false);
const { confirm } = useConfirm();

const newRequestId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;

watch(
  open,
  (v) => {
    if (!v) return;
    reason.value = "";
    requestId.value = newRequestId();
  },
  { immediate: true }
);

async function submit() {
  const problem = reasonProblem(reason.value) ?? props.problem?.() ?? null;
  if (problem) {
    toast.error(problem);
    return;
  }
  const question = props.confirmation();
  const ok = await confirm({
    ...question,
    confirmLabel: question.confirmLabel ?? props.submitLabel,
    destructive: props.destructive,
  });
  if (!ok) return;

  busy.value = true;
  try {
    const res = await $fetch<any>(props.endpoint, {
      method: "POST",
      body: { ...(props.body?.() ?? {}), reason: reason.value.trim(), requestId: requestId.value, confirmed: true },
    });
    open.value = false;
    if (res?.audited === false) toast.warning("Done, but its audit row couldn't be written. The details are in the server log.");
    else if (res?.unchanged) toast.info("It was already that way, so nothing changed.");
    else if (res?.replayed) toast.info("That had already gone through, so it wasn't done twice.");
    else toast.success(props.doneMessage?.(res) ?? "Done.");
    emit("done", res);
  } catch (e: any) {
    // The server answered, so this submit is settled: the next one is new.
    if (e?.statusCode || e?.status) requestId.value = newRequestId();
    toast.error(e?.data?.message || e?.statusMessage || e?.message || "That didn't go through.");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md" data-ops-action-dialog>
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription v-if="description">{{ description }}</DialogDescription>
      </DialogHeader>

      <form class="space-y-4" @submit.prevent="submit">
        <slot />
        <div class="space-y-1.5">
          <Label for="ops-action-reason">Reason</Label>
          <Textarea
            id="ops-action-reason"
            v-model="reason"
            rows="3"
            :maxlength="REASON_MAX"
            :disabled="busy"
            placeholder="Why, in a sentence. It goes in the console's audit log."
          />
        </div>
        <DialogFooter class="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" :disabled="busy" @click="open = false">Cancel</Button>
          <Button type="submit" :variant="destructive ? 'destructive' : 'default'" :disabled="busy">
            <Icon v-if="busy" name="lucide:loader-circle" class="mr-1.5 h-4 w-4 animate-spin" />
            {{ busy ? "Working…" : submitLabel }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>

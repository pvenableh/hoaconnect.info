<script setup lang="ts">
// Attach files to a support message. Each file uploads on its own as soon as
// it's chosen (POST /api/support/attachments: a Vercel function body tops out at
// 4.5 MB), and the parent sends the ids with the message. A photo over the 4 MB
// cap is redrawn smaller here first, so a phone picture still fits.
import { toast } from "vue-sonner";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENTS_PER_MESSAGE,
  SHRINK_STEPS,
  SHRINKABLE_TYPES,
  attachmentProblem,
  attachmentType,
  formatBytes,
  type SupportAttachment,
} from "#core/shared/support/attachments";

const props = defineProps<{ disabled?: boolean }>();
const files = defineModel<SupportAttachment[]>({ default: () => [] });
const uploading = defineModel<boolean>("uploading", { default: false });

const input = ref<HTMLInputElement | null>(null);
const pending = ref<string[]>([]);
const room = computed(() => ATTACHMENTS_PER_MESSAGE - files.value.length - pending.value.length);

/** Redraw a photo smaller, as JPEG on white, until it fits; null if it never does. */
async function shrink(file: File): Promise<File | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;
  try {
    for (const step of SHRINK_STEPS) {
      const scale = Math.min(1, step.maxEdge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", step.quality));
      if (blob && blob.size <= ATTACHMENT_MAX_BYTES) {
        return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
      }
    }
    return null;
  } finally {
    bitmap.close();
  }
}

async function prepare(file: File): Promise<File | null> {
  const type = attachmentType(file.name)?.type;
  if (type && file.size > ATTACHMENT_MAX_BYTES && SHRINKABLE_TYPES.has(type)) {
    const smaller = await shrink(file);
    if (!smaller) toast.error(`${file.name} is over 4 MB and couldn't be made smaller. Send a smaller copy.`);
    return smaller;
  }
  const problem = attachmentProblem(file);
  if (problem) {
    toast.error(problem);
    return null;
  }
  return file;
}

async function add(list: FileList | null) {
  const chosen = [...(list ?? [])];
  if (input.value) input.value.value = "";
  if (chosen.length > room.value) toast.error(`Attach up to ${ATTACHMENTS_PER_MESSAGE} files to one message.`);
  for (const file of chosen.slice(0, Math.max(0, room.value))) {
    pending.value.push(file.name);
    uploading.value = true;
    try {
      const ready = await prepare(file);
      if (!ready) continue;
      const form = new FormData();
      form.append("file", ready, ready.name);
      const saved = await $fetch<SupportAttachment>("/api/support/attachments", { method: "POST", body: form });
      files.value = [...files.value, saved];
    } catch (e: any) {
      toast.error(e?.data?.message || `${file.name} didn't upload.`);
    } finally {
      pending.value.splice(pending.value.indexOf(file.name), 1);
      uploading.value = pending.value.length > 0;
    }
  }
}

function remove(id: string) {
  files.value = files.value.filter((f) => f.id !== id);
}
</script>

<template>
  <div class="space-y-2">
    <ul v-if="files.length || pending.length" class="flex flex-wrap gap-2">
      <li v-for="f in files" :key="f.id" class="flex items-center gap-1.5 rounded-full border border-[var(--theme-border-primary)] py-1 pl-3 pr-1 type-micro t-text">
        <Icon name="lucide:paperclip" class="size-3.5 t-text-muted" />
        <span class="max-w-[12rem] truncate">{{ f.name }}</span>
        <span class="t-text-muted">{{ formatBytes(f.size) }}</span>
        <Button type="button" variant="ghost" size="icon-sm" :aria-label="`Remove ${f.name}`" :disabled="props.disabled" @click="remove(f.id)">
          <Icon name="lucide:x" class="size-3.5" />
        </Button>
      </li>
      <li v-for="(name, i) in pending" :key="`p-${i}`" class="flex items-center gap-1.5 rounded-full border border-dashed border-[var(--theme-border-primary)] px-3 py-1 type-micro t-text-muted">
        <Icon name="lucide:loader-circle" class="size-3.5 animate-spin" />
        <span class="max-w-[12rem] truncate">{{ name }}</span>
      </li>
    </ul>
    <input ref="input" type="file" multiple :accept="ATTACHMENT_ACCEPT" class="sr-only" tabindex="-1" @change="add(($event.target as HTMLInputElement).files)" />
    <Button type="button" variant="ghost" size="sm" :disabled="props.disabled || room <= 0" @click="input?.click()">
      <Icon name="lucide:paperclip" class="size-4" />
      Attach files
    </Button>
    <p class="type-micro t-text-muted">Images, PDFs, text, Word or Excel · up to {{ ATTACHMENTS_PER_MESSAGE }}, 4 MB each</p>
  </div>
</template>

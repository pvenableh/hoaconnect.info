<!--
  AppCreateMenu — the Nav's one "+ New" pill (Earnest's AppCreateMenu).

  Lists the create verbs this viewer may run here — the gated list from
  useCreateVerbs, never one of its own — and runs the one picked: it navigates
  to the page that owns the form, which opens it (useCreateIntent). Renders
  nothing when there is nothing to create (members, previewing the member view).
-->
<script setup lang="ts">
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const { verbs, run } = useCreateVerbs();
</script>

<template>
  <DropdownMenu v-if="verbs.length">
    <DropdownMenuTrigger
      class="header-pill header-pill--wide inline-flex items-center gap-1.5 text-sm font-medium"
      title="Create"
      aria-label="Create new"
      data-create-menu
    >
      <Icon name="lucide:plus" class="size-4" />
      <span>New</span>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-56">
      <DropdownMenuLabel class="type-micro">Create</DropdownMenuLabel>
      <DropdownMenuItem
        v-for="v in verbs"
        :key="v.id"
        class="cursor-pointer gap-2"
        :data-create-verb="v.id"
        @select="run(v.id)"
      >
        <Icon :name="v.icon" class="size-4 text-muted-foreground" />
        {{ v.label }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>

<script setup lang="ts">
/**
 * ActionButton — the T3 and T4 rungs of the button ladder
 * (docs/button-type-case-system.md). Ported from Earnest's UiActionButton.
 *
 *   T1  <Button>                    one filled primary per view
 *   T2  <Button variant="outline">  secondary actions
 *   T3  <ActionButton>              tertiary / inline: a 28px frosted pill
 *   T4  <ActionButton size="xs">    micro: a 24px bare glyph that grows a hover circle
 *
 * T3 labels are Title Case actions ("Add Unit", "Reply"). T4 has NO label —
 * pass `title`, which becomes the accessible name.
 *
 * `pressed` makes it a toggle (aria-pressed) wearing the same active-thumb
 * material as the segmented control, for a filter that switches ONE condition
 * on and off ("Overdue only"). Leave it undefined on ordinary actions.
 */
const props = withDefaults(
  defineProps<{
    /** Iconify name, e.g. "lucide:plus". The #icon slot overrides it. */
    icon?: string;
    variant?: "default" | "primary" | "destructive";
    loading?: boolean;
    disabled?: boolean;
    /** Hide the label below a breakpoint ('sm' / 'md'), or always ('always'). */
    hideLabel?: "sm" | "md" | "always";
    /** Native tooltip + accessible name. Set it whenever the label may be hidden. */
    title?: string;
    /** A perfect circle, icon-only — header and toolbar icon buttons. */
    circle?: boolean;
    /** `sm` (default) is the T3 pill; `md` matches h-8 filter controls; `xs` is T4. */
    size?: "xs" | "sm" | "md";
    type?: "button" | "submit";
    /**
     * ⚠️ The `undefined` default is LOAD-BEARING. A boolean prop with no default
     * is cast to `false` by Vue, which would render `aria-pressed="false"` on
     * every ordinary action and announce it as an unpressed toggle (Earnest
     * shipped exactly that bug). With an explicit default an omitted `pressed`
     * really is undefined, and the attribute is left off.
     */
    pressed?: boolean;
  }>(),
  { variant: "default", size: "sm", type: "button", pressed: undefined },
);

defineEmits<{ click: [event: MouseEvent] }>();

const isMicro = computed(() => props.size === "xs" && !props.circle);

const variantClasses = computed(() => {
  // T4 rests MUTED and only reaches full colour on hover: it sits inside
  // someone else's content and must not compete with it at rest. Full muted,
  // never an alpha of it — the glyph IS the control, so it owes 3:1.
  if (isMicro.value) {
    switch (props.variant) {
      case "primary":
        return "text-muted-foreground hover:text-foreground hover:bg-primary/10";
      case "destructive":
        return "text-muted-foreground hover:text-destructive hover:bg-destructive/10";
      default:
        return "text-muted-foreground hover:text-foreground hover:bg-muted/60";
    }
  }
  // The frosted pane (glass-btn-soft) owns the resting fill and rim; these only
  // tint on hover. Primary INKS in foreground and keeps the accent for the hover
  // tint: as text on this pane the accent fails AA in several themes.
  switch (props.variant) {
    case "primary":
      return "text-foreground hover:bg-primary/10";
    case "destructive":
      return "text-destructive hover:bg-destructive/10";
    default:
      return "text-foreground hover:bg-muted/50";
  }
});

const sizeClasses = computed(() => {
  if (props.circle) return "size-8 p-0 justify-center";
  if (isMicro.value) return "size-6 p-0 justify-center shrink-0";
  return props.size === "md" ? "gap-1.5 h-8 px-3" : "gap-1 h-7 px-2.5";
});

const iconClass = computed(() => (isMicro.value ? "size-3" : "size-3.5"));

const labelClass = computed(() => {
  if (props.hideLabel === "sm") return "hidden sm:inline";
  if (props.hideLabel === "md") return "hidden md:inline";
  if (props.hideLabel === "always") return "sr-only";
  return "";
});
</script>

<template>
  <button
    :type="type"
    data-slot="action-button"
    class="inline-flex items-center whitespace-nowrap rounded-full text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
    :class="[
      isMicro ? null : 'glass-btn-soft',
      variantClasses,
      sizeClasses,
      pressed ? 'glass-active-thumb relative text-foreground' : null,
    ]"
    :disabled="disabled || loading"
    :title="title"
    :aria-label="title"
    :aria-pressed="pressed === undefined ? undefined : pressed"
    :aria-busy="loading || undefined"
    @click="$emit('click', $event)"
  >
    <span v-if="loading" class="spinner-ios spinner-ios--sm" aria-hidden="true" />
    <slot v-else-if="$slots.icon" name="icon" />
    <Icon v-else-if="icon" :name="icon" :class="iconClass" />
    <span v-if="$slots.default" :class="labelClass">
      <slot />
    </span>
  </button>
</template>

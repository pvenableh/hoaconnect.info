import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

export { default as ToggleGroup } from "./ToggleGroup.vue"
export { default as ToggleGroupItem } from "./ToggleGroupItem.vue"

// One ON material for every "this one is selected" in the workspace: the same
// `glass-active-thumb` the segmented control slides and ActionButton's
// `pressed` state wears, so a filter row mixing them reads as one family.
// A toggle group is for INDEPENDENT on/off choices (bold + italic, a set of
// visible columns) or a compact single choice inside a toolbar; switching
// between sibling VIEWS is AppSegmentedControl's job, not this one's.
export const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium whitespace-nowrap text-muted-foreground transition-[color,background-color,box-shadow] outline-none hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=on]:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "glass-btn-soft",
      },
      size: {
        default: "h-9 min-w-9 px-3",
        sm: "h-8 min-w-8 px-2.5",
        lg: "h-10 min-w-10 px-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export type ToggleVariants = VariantProps<typeof toggleVariants>

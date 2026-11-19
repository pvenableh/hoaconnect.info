/**
 * HOA Connect's button tiers, on top of the stock shadcn-vue `buttonVariants`
 * (app/components/ui/button, left as shipped so it can be re-pulled).
 *
 * The project changes, per variant:
 * - every size is a pill (`rounded-full` replaces the stock `rounded-md`);
 * - default / destructive wear the lit-edge glass (`glass-btn-primary` /
 *   `-destructive`, earnest-ui.css), which only adds a background-image and a
 *   box-shadow the stock variants do not set, so a class is enough;
 * - destructive keeps `text-destructive-foreground` and its fill in the dark
 *   (stock is `text-white` and `dark:bg-destructive/60`, which the palette work
 *   of 2026-08-21 moved away from);
 * - outline / secondary wear the quiet pane (`glass-btn-soft`, `--tinted`). That
 *   material is layered, and the stock `bg-background` / `border` / `shadow-xs`
 *   / `bg-secondary` utilities would beat it, so `app-btn-soft` restates it
 *   UNLAYERED in earnest-ui.css (handing focus back to the stock ring, from
 *   which `shadow-none` takes the stock `shadow-xs`).
 *   It lives there, not in AppButton's <style>, because stock parts that call
 *   `buttonVariants()` themselves (AlertDialogCancel, the pagination items)
 *   need it too.
 *
 * `appButtonClasses` is only the project additions — pass it to a stock part
 * that already applies `buttonVariants()` internally. `appButtonVariants` is
 * the whole class list, a drop-in for `buttonVariants` on an element that is
 * not a button component (a NuxtLink, a label). Both merge through `cn`, so
 * tailwind-merge drops the stock classes they replace.
 */
import type { ButtonVariants } from "~/components/ui/button";
import { buttonVariants } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type Variant = NonNullable<ButtonVariants["variant"]>;

const variantClasses: Record<Variant, string> = {
  default: "glass-btn-primary",
  // dark:bg-destructive replaces the stock dark:bg-destructive/60, and outranks
  // the stock hover:bg-destructive/90 in the dark, so the hover is restated there.
  destructive: "glass-btn-destructive text-destructive-foreground dark:bg-destructive dark:hover:bg-destructive/90",
  // shadow-none: the stock `shadow-xs` would otherwise sit under the focus ring.
  outline: "glass-btn-soft app-btn-soft shadow-none",
  secondary: "glass-btn-soft glass-btn-soft--tinted app-btn-soft app-btn-soft--tinted",
  ghost: "",
  link: "",
};

export function appButtonClasses(opts: { variant?: ButtonVariants["variant"] } = {}) {
  return cn("rounded-full", variantClasses[opts.variant ?? "default"]);
}

export function appButtonVariants(opts: { variant?: ButtonVariants["variant"]; size?: ButtonVariants["size"] } = {}) {
  return cn(buttonVariants(opts), appButtonClasses(opts));
}

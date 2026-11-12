/**
 * useConfirm — the app's replacement for `window.confirm()` / `window.alert()`.
 *
 * Promise-based, so a call site keeps the shape it had with the native dialog:
 *
 *   const { confirm } = useConfirm();
 *   if (!(await confirm({ title: "Delete this unit?", body: "…", destructive: true }))) return;
 *
 * The native dialogs are unstyled, block the main thread, cannot be themed, show
 * the page's host name as their title, and on iOS standalone (the installed PWA)
 * are sometimes suppressed outright — a "Delete?" that silently returns false.
 * This renders the glass `AlertDialog` instead, through ONE host
 * (`<AppConfirmDialog />`, mounted in app.vue), so every page gets it without
 * mounting anything.
 *
 * Calls queue: a second confirm() while one is open waits its turn rather than
 * replacing it, so neither promise is orphaned.
 *
 * A string is shorthand for `{ title }` — it makes the sweep from
 * `confirm("Delete?")` mechanical.
 *
 * `prompt()` replaces `window.prompt()`: the same dialog with one text field.
 * It resolves the text on the action (trimmed, possibly empty) and `null` on
 * Cancel / Esc / outside click — so a Cancel stops what the dialog was asking
 * about, which the native prompt's callers here never did. It takes an options
 * object only (that is what keeps the native-dialogs audit able to tell the two
 * apart).
 *
 * State is module-scope (one dialog per tab), the same pattern as the panel
 * composables. On the server there is no one to ask, so confirm() resolves
 * false and alert() resolves immediately; neither is ever reached from SSR in
 * practice, because both answer a click.
 */
import { computed, shallowRef } from "vue";

export interface ConfirmOptions {
  /** One line, sentence case: the question, not "Are you sure?". */
  title: string;
  /** Optional consequence line ("This cannot be undone."). */
  body?: string;
  /** Title Case action label. Defaults to "Confirm" (or "Delete" when destructive). */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Paints the action as the destructive tier. */
  destructive?: boolean;
}

export interface AlertOptions {
  title: string;
  body?: string;
  /** Defaults to "OK". */
  confirmLabel?: string;
}

export interface PromptOptions extends ConfirmOptions {
  /** The field's visible label ("Reason (optional)"). Without one, the title names it. */
  label?: string;
  placeholder?: string;
  /** Prefilled text, selected so typing replaces it. */
  defaultValue?: string;
  /** A textarea instead of a one-line input. */
  multiline?: boolean;
  /** The action stays disabled until something other than spaces is typed. */
  required?: boolean;
  maxLength?: number;
}

export interface PromptField {
  label?: string;
  placeholder?: string;
  defaultValue: string;
  multiline: boolean;
  required: boolean;
  maxLength?: number;
}

export interface PendingDialog {
  id: number;
  kind: "confirm" | "alert" | "prompt";
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
  /** Only on a prompt. */
  field?: PromptField;
  resolve: (ok: boolean, text?: string) => void;
}

const queue = shallowRef<PendingDialog[]>([]);
let nextId = 1;

function push(
  kind: PendingDialog["kind"],
  opts: ConfirmOptions | AlertOptions,
  resolve: PendingDialog["resolve"],
  field?: PromptField,
) {
  const destructive = kind !== "alert" && !!(opts as ConfirmOptions).destructive;
  queue.value = [
    ...queue.value,
    {
      id: nextId++,
      kind,
      title: opts.title,
      body: opts.body,
      confirmLabel:
        opts.confirmLabel ?? (kind === "alert" ? "OK" : destructive ? "Delete" : "Confirm"),
      cancelLabel: (opts as ConfirmOptions).cancelLabel ?? "Cancel",
      destructive,
      field,
      resolve,
    },
  ];
}

function enqueue(kind: "confirm" | "alert", opts: ConfirmOptions | AlertOptions): Promise<boolean> {
  if (import.meta.server) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => push(kind, opts, (ok) => resolve(ok)));
}

function enqueuePrompt(opts: PromptOptions): Promise<string | null> {
  if (import.meta.server) return Promise.resolve(null);
  const field: PromptField = {
    label: opts.label,
    placeholder: opts.placeholder,
    defaultValue: opts.defaultValue ?? "",
    multiline: !!opts.multiline,
    required: !!opts.required,
    maxLength: opts.maxLength,
  };
  return new Promise<string | null>((resolve) =>
    push("prompt", opts, (ok, text) => resolve(ok ? (text ?? "").trim() : null), field),
  );
}

/** Whether a prompt's text may be accepted (a required field needs more than spaces). */
export function promptTextOk(field: PromptField | undefined, text: string): boolean {
  if (!field) return true;
  if (field.required && !text.trim()) return false;
  if (field.maxLength != null && text.length > field.maxLength) return false;
  return true;
}

const normalize = <T extends { title: string }>(o: string | T): T =>
  (typeof o === "string" ? { title: o } : o) as T;

/**
 * Settle the dialog on screen and move to the next one. Used by the host.
 * `text` is a prompt's field; an action whose text a prompt cannot accept
 * (required and blank, or too long) is ignored and the dialog stays.
 */
export function settleConfirm(id: number, ok: boolean, text?: string) {
  const current = queue.value[0];
  if (!current || current.id !== id) return;
  if (ok && current.kind === "prompt" && !promptTextOk(current.field, text ?? "")) return;
  queue.value = queue.value.slice(1);
  current.resolve(current.kind === "alert" ? true : ok, text);
}

export function useConfirm() {
  return {
    /** Resolves true on the action, false on Cancel / Esc / outside click. */
    confirm: (opts: string | ConfirmOptions) => enqueue("confirm", normalize(opts)),
    /** Resolves once dismissed. */
    alert: (opts: string | AlertOptions) =>
      enqueue("alert", normalize(opts)).then(() => undefined),
    /** Resolves the trimmed text on the action, `null` on Cancel / Esc / outside click. */
    prompt: (opts: PromptOptions) => enqueuePrompt(opts),
    /** The dialog on screen, if any. Read by `<AppConfirmDialog />`. */
    current: computed(() => queue.value[0] ?? null),
    settle: settleConfirm,
  };
}

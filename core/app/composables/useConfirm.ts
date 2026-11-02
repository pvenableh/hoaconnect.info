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

export interface PendingDialog {
  id: number;
  kind: "confirm" | "alert";
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
  resolve: (ok: boolean) => void;
}

const queue = shallowRef<PendingDialog[]>([]);
let nextId = 1;

function enqueue(
  kind: PendingDialog["kind"],
  opts: ConfirmOptions | AlertOptions,
): Promise<boolean> {
  if (import.meta.server) return Promise.resolve(false);
  const destructive = kind === "confirm" && !!(opts as ConfirmOptions).destructive;
  return new Promise<boolean>((resolve) => {
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
        resolve,
      },
    ];
  });
}

const normalize = <T extends { title: string }>(o: string | T): T =>
  (typeof o === "string" ? { title: o } : o) as T;

/** Settle the dialog on screen and move to the next one. Used by the host. */
export function settleConfirm(id: number, ok: boolean) {
  const current = queue.value[0];
  if (!current || current.id !== id) return;
  queue.value = queue.value.slice(1);
  current.resolve(current.kind === "alert" ? true : ok);
}

export function useConfirm() {
  return {
    /** Resolves true on the action, false on Cancel / Esc / outside click. */
    confirm: (opts: string | ConfirmOptions) => enqueue("confirm", normalize(opts)),
    /** Resolves once dismissed. */
    alert: (opts: string | AlertOptions) =>
      enqueue("alert", normalize(opts)).then(() => undefined),
    /** The dialog on screen, if any. Read by `<AppConfirmDialog />`. */
    current: computed(() => queue.value[0] ?? null),
    settle: settleConfirm,
  };
}

/**
 * What to do when a newer deploy is detected — pure, so the rule can be stated
 * and tested independently of visibility events, timers, and reloads.
 *
 * An installed PWA is never "reloaded" the way a browser tab is: iOS and Android
 * keep the standalone window alive for days, so a client can sit on a build
 * whose JS chunks no longer exist on the CDN. Two failure modes follow — stale
 * UI (the user swears the bug isn't fixed) and hard breakage (a lazy route chunk
 * 404s mid-navigation).
 *
 * The rule that makes the fix feel native rather than hostile:
 *
 *   hidden + nothing unsaved → reload NOW, silently. Nobody is looking and
 *                              nothing is at stake, so the user simply finds a
 *                              fresh app the next time they open it.
 *   hidden + unsaved work    → defer. A half-written announcement or a partly
 *                              filled form must never be thrown away by a
 *                              background reload. The pending flag stays up, so
 *                              the prompt appears when they come back and the
 *                              silent reload retries on the next clean
 *                              background.
 *   visible                  → prompt. Never yank the page out from under
 *                              someone who is looking at it, dirty or not.
 */

export type UpdateAction = "reload" | "prompt" | "defer";

export interface UpdateContext {
  /** Is the document currently visible to the user? */
  visible: boolean;
  /** Is there unsaved input on screen (see useUnsavedWork)? */
  dirty: boolean;
}

export function decideUpdateAction({ visible, dirty }: UpdateContext): UpdateAction {
  if (visible) return "prompt";
  return dirty ? "defer" : "reload";
}

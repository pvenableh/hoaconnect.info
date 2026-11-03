/**
 * Resident notification events that are also a reminder stage (Earnest parity
 * round 3, Phase 5b): a request changed status, a poll opened, a poll closed.
 * Each route that makes one happen calls `notifyReminderEvent` once, after its
 * own write has landed; the engine does the rest (`announceReminderEvent`:
 * same audience, words and log key as the tick, so one path sends).
 *
 * Best-effort by design, like every notification in the app: a notification
 * that can't be sent never fails the poll that was just closed. It returns
 * null and warns.
 */
import {
  announceReminderEvent,
  directusReminderStore,
  reminderSchema,
  sendReminder,
  type ReminderEntityRef,
  type ReminderEventResult,
} from "./reminders";

export async function notifyReminderEvent(
  orgId: string,
  entity: ReminderEntityRef,
  stage: "status" | "opened" | "closed",
  opts: { asOf?: Date } = {}
): Promise<ReminderEventResult | null> {
  try {
    const directus = getTypedDirectus();
    const provisioned = await reminderSchema(directus);
    const store = directusReminderStore(directus, { provisioned });
    const [org] = await store.listOrgs(orgId);
    if (!org) return null;
    return await announceReminderEvent({ store, send: sendReminder, provisioned, org, entity, stage, asOf: opts.asOf });
  } catch (e) {
    console.warn(`[reminders] ${entity.collection} ${stage} event failed:`, (e as Error).message);
    return null;
  }
}

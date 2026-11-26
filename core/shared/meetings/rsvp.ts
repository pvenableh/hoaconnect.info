// Meeting RSVPs (docs/plan-unified-experience.md §5, owner "RSVP"): a member's
// answer to "are you coming?" for an upcoming meeting. Intent, not attendance;
// `hoa_meeting_attendees` still records who came. Pure: the route reads rows.

export const RSVP_RESPONSES = ["going", "maybe", "not_going"] as const;
export type RsvpResponse = (typeof RSVP_RESPONSES)[number];

export const RSVP_LABEL: Record<RsvpResponse, string> = { going: "Going", maybe: "Maybe", not_going: "Can't go" };

export const isRsvpResponse = (v: unknown): v is RsvpResponse => typeof v === "string" && (RSVP_RESPONSES as readonly string[]).includes(v);

/** The unique key: one RSVP per member per meeting. */
export const rsvpKey = (meetingId: string, memberId: string) => `${meetingId}:${memberId}`;

export function rsvpCounts(rows: readonly { response?: string | null }[]): Record<RsvpResponse, number> {
  const out: Record<RsvpResponse, number> = { going: 0, maybe: 0, not_going: 0 };
  for (const r of rows) if (isRsvpResponse(r.response)) out[r.response]++;
  return out;
}

/**
 * Whether a member may still answer: the meeting is published, scheduled, and
 * has not started (`now` in ms). A meeting with no date takes no RSVPs.
 */
export function rsvpOpen(m: { status?: string | null; is_published?: boolean | null; meeting_date?: string | null }, now: number): boolean {
  if (m.status !== "scheduled" || m.is_published !== true || !m.meeting_date) return false;
  const at = Date.parse(m.meeting_date);
  return Number.isFinite(at) && at > now;
}

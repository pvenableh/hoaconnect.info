// Pure validation/normalization for portal activity events. The write route
// runs untrusted client payloads through this before persisting: it whitelists
// the event type, coerces fields to strings, caps lengths, and bounds the
// batch size. Framework-free so it's unit-testable and shared client/server.

export const ACTIVITY_EVENT_TYPES = [
  "page_view",
  "download",
  "doc_view",
  "login",
  "logout",
  "session_start",
  "payment",
  "request",
  "profile_update",
  "upload",
  "search",
] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

const EVENT_SET = new Set<string>(ACTIVITY_EVENT_TYPES);

/** Max events accepted per write request (drops the overflow). */
export const ACTIVITY_BATCH_LIMIT = 50;

export interface RawActivityEvent {
  type?: unknown;
  path?: unknown;
  targetCollection?: unknown;
  targetId?: unknown;
  label?: unknown;
  metadata?: unknown;
  sessionId?: unknown;
}

export interface NormalizedActivityEvent {
  event_type: ActivityEventType;
  path: string | null;
  target_collection: string | null;
  target_id: string | null;
  label: string | null;
  metadata: Record<string, unknown> | null;
  session_id: string | null;
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/** Validate + normalize one raw event, or null if the type isn't recognized. */
export function normalizeActivityEvent(raw: RawActivityEvent): NormalizedActivityEvent | null {
  if (!raw || typeof raw.type !== "string" || !EVENT_SET.has(raw.type)) return null;

  let metadata: Record<string, unknown> | null = null;
  if (raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)) {
    metadata = raw.metadata as Record<string, unknown>;
  }

  return {
    event_type: raw.type as ActivityEventType,
    path: str(raw.path, 1024),
    target_collection: str(raw.targetCollection, 128),
    target_id: str(raw.targetId, 255),
    label: str(raw.label, 512),
    metadata,
    session_id: str(raw.sessionId, 64),
  };
}

/** Normalize a batch: drops invalid entries and caps at ACTIVITY_BATCH_LIMIT. */
export function normalizeActivityBatch(rawList: unknown): NormalizedActivityEvent[] {
  if (!Array.isArray(rawList)) return [];
  const out: NormalizedActivityEvent[] = [];
  for (const raw of rawList) {
    if (out.length >= ACTIVITY_BATCH_LIMIT) break;
    const normalized = normalizeActivityEvent(raw as RawActivityEvent);
    if (normalized) out.push(normalized);
  }
  return out;
}

/**
 * useMemberNames — show other people by their membership name
 * (core/shared/members/display-name.ts). Components that read a login object
 * (a message's `user_created`, a request's `submitted_by`) call `nameOf(login)`:
 * it returns the community's name for that person once known, and the login's
 * name until then. Lookups are batched per tick and cached per community for
 * the session, through GET /api/org/member-names.
 */
import { displayName, type NameParts } from "#core/shared/members/display-name";

type Login = (NameParts & { id?: string | null }) | string | null | undefined;

const cache = reactive(new Map<string, string | null>()); // `${org}:${user}` → name, or null when none
const queued = new Map<string, Set<string>>(); // org → user ids waiting
const asked = new Set<string>(); // keys already queued or answered: each is fetched once
let flushing: Promise<void> | null = null;

async function flush() {
  await Promise.resolve();
  const batches = [...queued.entries()];
  queued.clear();
  flushing = null;
  for (const [orgId, ids] of batches) {
    const users = [...ids];
    for (let i = 0; i < users.length; i += 200) {
      const chunk = users.slice(i, i + 200);
      try {
        const res = await $fetch<{ names: Record<string, string> }>("/api/org/member-names", {
          query: { orgId, users: chunk.join(",") },
        });
        for (const id of chunk) cache.set(`${orgId}:${id}`, res.names[id] ?? null);
      } catch {
        for (const id of chunk) cache.set(`${orgId}:${id}`, null);
      }
    }
  }
}

export function useMemberNames() {
  const selectedOrgId = useState<string | null>("selectedOrgId", () => null);

  /** The name others should see for this login, in the community on screen. */
  const nameOf = (login: Login, fallback = "Member"): string => {
    const id = typeof login === "string" ? login : login?.id ?? null;
    const orgId = selectedOrgId.value;
    const loginParts = typeof login === "object" ? login : null;
    if (!id || !orgId || import.meta.server) return displayName(null, loginParts, fallback);
    const key = `${orgId}:${id}`;
    if (!asked.has(key)) {
      asked.add(key);
      const set = queued.get(orgId) ?? new Set<string>();
      set.add(id);
      queued.set(orgId, set);
      flushing ??= flush();
    }
    // A reactive read even before the answer lands, so the caller re-renders.
    return cache.get(key) || displayName(null, loginParts, fallback);
  };

  return { nameOf };
}

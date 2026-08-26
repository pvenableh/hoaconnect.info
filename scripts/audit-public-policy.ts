/**
 * Audit the Directus **public** policy — what an unauthenticated request can read.
 *
 * The public policy applies to every session-less request, and `/api/directus/items`
 * falls back to the public client whenever there is no session, so anything granted
 * here is readable by anyone who can reach the app. It also cannot be tenant-scoped:
 * an anonymous request has no `$CURRENT_USER`, so every grant is inherently
 * cross-org. On 2026-08-26 it carried unfiltered `read` on 12 collections,
 * including `hoa_members` (136 real names/emails/phones across every org) and
 * `hoa_invitations` (acceptance tokens in cleartext — a leaked pending token
 * lets an anonymous caller create an account via accept-invitation.post.ts).
 *
 * Those 12 were removed after proving no anonymous consumer existed: every server
 * route reads through `getTypedDirectus()` (static token), no component calls
 * `useDirectus()`, and `useDirectusItems` defaults to `requireAuth: true`.
 * All 12 public pages rendered byte-identically before and after.
 *
 *   pnpm run audit:public-policy    # exits 1 on drift
 *
 * The allow-list below is the whole contract. Adding to it means accepting a
 * cross-tenant, unauthenticated read — do that deliberately, not by accident.
 */

const DIRECTUS_URL = process.env.DIRECTUS_URL;
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

/**
 * Every grant the public policy is allowed to hold, with why it must exist.
 *
 * A `filter` here is part of the contract, not a nicety: an unfiltered grant
 * that is *supposed* to be filtered fails this audit exactly like an unexpected
 * collection would. That is the whole point for `directus_files` — the grant
 * must keep existing, and must keep being narrow.
 */
const ALLOWED: Record<string, { action: string; why: string; filter?: unknown }> = {
  directus_files: {
    action: "read",
    // Images only, and the restriction is load-bearing. Unfiltered, this grant
    // served 605 Lincoln Road's balance sheets, its approved meeting minutes and
    // a data-export archive to anonymous callers. It cannot simply be deleted:
    // the logo in every email already sitting in a recipient's inbox is a bare
    // /assets/<id> URL fetched by a mail client with no session, and so is every
    // image on an anonymous landing page. Images stay public; everything else
    // goes through /api/directus/assets/:id, which checks the session and the
    // file's owning organization.
    filter: { _and: [{ type: { _starts_with: "image/" } }] },
    why: "landing + already-sent-email images are fetched with no session (images only)",
  },
  subscription_plans: {
    action: "read",
    why: "marketing pricing page + OrganizationSetupForm (requireAuth: false)",
  },
  waitlist_signups: {
    action: "create",
    why: "marketing waitlist form (already field-scoped)",
  },
};

async function df(endpoint: string): Promise<any> {
  const res = await fetch(`${DIRECTUS_URL}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}`,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} on ${endpoint}`);
  return res.json();
}

async function main() {
  const policies = (await df("/policies?fields=id,name&limit=100")).data as {
    id: string;
    name: string;
  }[];
  const pub = policies.find((p) => p.name === "$t:public_label" || p.name === "Public");
  if (!pub) {
    console.error("❌ Could not find the public policy");
    process.exit(1);
  }

  const perms = (
    await df(
      `/permissions?filter%5Bpolicy%5D%5B_eq%5D=${pub.id}&fields=id,collection,action,fields,permissions&limit=200`
    )
  ).data as {
    id: number;
    collection: string;
    action: string;
    fields: string[] | null;
    permissions: unknown;
  }[];

  const unexpected: typeof perms = [];
  const widened: { collection: string; expected: unknown; actual: unknown }[] = [];
  console.log(`\nPublic policy (${pub.id}) — ${perms.length} grant(s):\n`);
  for (const p of perms.sort((a, b) => a.collection.localeCompare(b.collection))) {
    const allowed = ALLOWED[p.collection];
    const ok = allowed && allowed.action === p.action;
    const scope = p.permissions == null ? "UNFILTERED" : "filtered";
    // A grant whose filter has drifted is still "expected", so it is reported on
    // its own line rather than as an unknown collection — the fix differs.
    const scoped =
      ok && allowed.filter !== undefined
        ? JSON.stringify(p.permissions) === JSON.stringify(allowed.filter)
        : true;
    console.log(
      `  ${ok && scoped ? "✓" : "✗"} ${p.collection.padEnd(22)} ${p.action.padEnd(7)} ${scope.padEnd(
        11
      )} ${ok ? allowed.why : "NOT IN ALLOW-LIST"}`
    );
    if (!ok) unexpected.push(p);
    else if (!scoped)
      widened.push({ collection: p.collection, expected: allowed.filter, actual: p.permissions });
  }

  const missing = Object.keys(ALLOWED).filter(
    (c) => !perms.some((p) => p.collection === c && p.action === ALLOWED[c].action)
  );
  for (const c of missing) console.log(`  ! ${c.padEnd(22)} expected but ABSENT — ${ALLOWED[c].why}`);

  console.log("");
  if (unexpected.length) {
    console.error(
      `❌ ${unexpected.length} unexpected public grant(s): ${unexpected
        .map((p) => `${p.collection}:${p.action}`)
        .join(", ")}`
    );
    console.error(
      "   Anonymous grants cannot be tenant-scoped — each one is a cross-org read.\n" +
        "   Remove it, or add it to ALLOWED with a reason if it is genuinely required."
    );
    process.exit(1);
  }
  if (missing.length) {
    console.error(`❌ ${missing.length} expected grant(s) missing — public surfaces may be broken`);
    process.exit(1);
  }
  if (widened.length) {
    for (const w of widened) {
      console.error(
        `❌ ${w.collection}: public read is WIDER than the contract\n` +
          `   expected filter: ${JSON.stringify(w.expected)}\n` +
          `   actual filter:   ${JSON.stringify(w.actual)}`
      );
    }
    console.error("   Re-run: pnpm run scope:public-files --apply");
    process.exit(1);
  }
  console.log("✅ Public policy matches the allow-list");
}

main().catch((e) => {
  console.error("❌", e instanceof Error ? e.message : e);
  process.exit(1);
});

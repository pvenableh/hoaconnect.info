// POST /api/support/inbound/:token — SendGrid Inbound Parse posts every email
// sent to the reply domain here (operator console Session G). Inbound Parse
// can't sign its posts, so the path carries a secret: SUPPORT_INBOUND_TOKEN.
//
// A wrong or missing token is 404, so the route doesn't announce itself; that's
// a misconfiguration, not an email. Everything else SendGrid sends is answered
// 200 whatever happens to it (refusals are logged as counts), so it doesn't
// retry an email we've chosen not to post. Only a failure on our side (Directus
// down) answers 500, so SendGrid tries again; a repeat of a reply already
// posted is recognised and dropped (core/server/utils/support-inbound.ts).
import { timingSafeEqual } from "node:crypto";
import { parseSendGridInbound, receiveSupportEmail } from "#core/server/utils/support-inbound";

const counts = new Map<string, number>();
function logOutcome(outcome: string): void {
  counts.set(outcome, (counts.get(outcome) ?? 0) + 1);
  const tally = [...counts].map(([k, n]) => `${k} ${n}`).join(", ");
  console.info(`[support-inbound] ${outcome} (this instance: ${tally})`);
}

function tokenMatches(token: string | undefined): boolean {
  const want = process.env.SUPPORT_INBOUND_TOKEN || "";
  if (want.length < 16 || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default defineEventHandler(async (event) => {
  if (!tokenMatches(getRouterParam(event, "token"))) throw createError({ statusCode: 404, message: "Not found" });

  const parts = await readMultipartFormData(event).catch(() => null);
  if (!parts?.length) {
    logOutcome("unreadable");
    return { ok: true };
  }
  try {
    const { outcome } = await receiveSupportEmail(parseSendGridInbound(parts));
    logOutcome(outcome);
    return { ok: true };
  } catch (e: any) {
    // A 4xx from the support helpers is a refusal in words (an attachment the
    // checks turned down after all): final. Anything else is ours: retry.
    if (e?.statusCode && e.statusCode < 500) {
      logOutcome("refused");
      return { ok: true };
    }
    logOutcome("error");
    console.error("[support-inbound] failed:", e?.message ?? e);
    throw createError({ statusCode: 500, message: "Try again" });
  }
});

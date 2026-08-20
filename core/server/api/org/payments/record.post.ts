/**
 * POST /api/org/payments/record
 *
 * Record a payment that arrived outside the app — a cheque, a bank transfer,
 * cash at a meeting — and put it in the community's permanent record.
 *
 * The admin payments screen did all three of these from the browser: create the
 * `payment_transactions` row, mark the charge paid, and nothing else. The third
 * thing is the point of this route. Money arriving is the other half of the
 * money story the ledger tells, and an offline payment is exactly the one that
 * later gets disputed — "I paid that in March" against a manager who has since
 * left and a spreadsheet nobody kept.
 *
 * **Board-only.** One payment names one household; see `buildPaymentRecordedEntry`
 * for why that default is not a matter of taste.
 *
 * Admin only. Marking someone's account paid on their behalf is not a grant we
 * hand to a manager by default — an admin can do it, and the entry says who did.
 */

import { createItem, readItems, updateItem } from "@directus/sdk";
import { buildPaymentRecordedEntry, toLedgerAmount } from "#core/shared/ledger/entries";

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody(event);

  const orgId = String(body?.orgId || "").trim();
  const requestId = String(body?.paymentRequestId || "").trim();
  if (!orgId || !requestId) {
    throw createError({
      statusCode: 400,
      statusMessage: "orgId and paymentRequestId are required",
    });
  }

  const admin = await checkAdminAccess(event, orgId);
  if (!admin.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: "Only an administrator can record a payment.",
    });
  }

  const directus = getTypedDirectus();

  const [requests, orgs] = await Promise.all([
    // Through the org filter: a charge from another community must miss.
    directus.request(
      readItems("payment_requests", {
        filter: { id: { _eq: requestId }, organization: { _eq: orgId } },
        fields: [
          "id",
          "title",
          "status",
          "amount",
          "amount_paid",
          "amount_remaining",
          "member.id",
          "member.first_name",
          "member.last_name",
          "member.email",
        ] as any,
        limit: 1,
      })
    ) as Promise<any[]>,
    directus.request(
      readItems("hoa_organizations", {
        filter: { id: { _eq: orgId } },
        fields: ["name"] as any,
        limit: 1,
      })
    ) as Promise<any[]>,
  ]);

  const request = requests?.[0];
  if (!request) {
    throw createError({ statusCode: 404, statusMessage: "No such charge in this community." });
  }
  if (request.status === "paid") {
    // Already settled: no second transaction, no second entry.
    return { recordedPayment: false, recorded: false, recordError: null, summary: null };
  }

  // Decimal columns arrive as strings; a concatenated amount here would write a
  // wrong number into a record that cannot be corrected in place.
  const total = toLedgerAmount(request.amount);
  const remaining = toLedgerAmount(request.amount_remaining ?? request.amount);
  const amount = remaining > 0 ? remaining : total;

  const member = request.member && typeof request.member === "object" ? request.member : null;
  const memberId = member?.id ? String(member.id) : null;
  const memberName =
    [member?.first_name, member?.last_name].filter(Boolean).join(" ").trim() || null;

  const paidAt = new Date().toISOString();

  const transaction = (await directus.request(
    createItem("payment_transactions", {
      organization: orgId,
      member: memberId,
      payment_request: requestId,
      amount,
      currency: "usd",
      status: "succeeded",
      description: `Manual payment — ${request.title ?? "charge"}`,
      stripe_payment_intent_id: `manual_${requestId}`,
      notes: "Recorded manually by an admin (offline payment).",
    } as any)
  )) as { id?: string };

  await directus.request(
    updateItem("payment_requests", requestId, {
      status: "paid",
      amount_paid: total || amount,
      amount_remaining: 0,
      paid_at: paidAt,
    } as any)
  );

  const user: any = session.user ?? {};

  const entry = buildPaymentRecordedEntry({
    organizationId: orgId,
    organizationName: orgs?.[0]?.name ?? null,
    payment: {
      transactionId: transaction?.id ?? null,
      memberId,
      memberName,
      amount,
      currency: "usd",
      // The charge's own title, not the synthetic "Manual payment — …" string
      // the transaction row carries: the entry should read like the charge did.
      description: request.title ?? null,
      method: "offline",
      reference: `manual_${requestId}`,
    },
    status: "succeeded",
    source: "manual",
    // The admin who recorded it — unlike an online payment, where the actor is
    // the payer. Both are true answers to "who did this".
    actor: {
      userId: user.id ?? null,
      name:
        [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
        user.email ||
        "An administrator",
      email: user.email ?? null,
    },
    occurredAt: paidAt,
  });

  let recorded = false;
  let recordError: string | null = null;
  if (entry) {
    try {
      await writeAuditEntry(entry);
      recorded = true;
    } catch (e: any) {
      console.error("[payments/record] audit write failed:", e);
      recordError = e?.message || "The payment was saved but could not be recorded in the ledger.";
    }
  }

  return { recordedPayment: true, recorded, recordError, summary: entry?.summary ?? null };
});

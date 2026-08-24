/**
 * POST /api/ai/director/plan — the Board Room's plan producer.
 *
 * Given an agenda subject (or one record, or a free-text steer), the assistant
 * writes a short briefing AND drafts a numbered plan in a single turn. Every
 * step becomes a real `ai_actions` row sharing one `plan_id`, so the plan on
 * screen and the review queue are the same objects — approve a step here and it
 * disappears from the queue there, because there is only one of it.
 *
 * ── What keeps this honest ──────────────────────────────────────────────────
 *
 * 1. GROUNDED BEFORE THE MODEL RUNS. `collectDirectorAgenda()` (Phase 4) is
 *    fetched first: real notices, real titles, real entity ids. Money mode also
 *    gets `buildMoneyIntel()` — actual totals, trend and aging. The model is
 *    then told, in as many words, that a figure not in that packet is not on
 *    record and must be described as missing rather than estimated.
 *
 * 2. STEPS GO THROUGH `proposeAction()`, FULL STOP. Not a copy of it, not a
 *    variant with its own approval logic — the same function chat uses. That is
 *    what makes `shouldAutoApprove()` and the outbound hard cap apply here
 *    unchanged: an emailed step lands `pending` at trust tier 3 the same way it
 *    would if a person had asked for it in the panel, and there is exactly one
 *    place in the codebase where that could ever stop being true.
 *
 * 3. METERED LIKE CHAT. Refused at a zero balance before a token is spent, and
 *    debited on the real usage of both passes afterwards.
 *
 * 4. CACHED FOR SIX HOURS. Reopening the same section serves the saved briefing
 *    and re-reads its steps, rather than billing the wallet again for the same
 *    answer to the same facts. `refresh: true` forces a redraft.
 *
 * Body: { orgId, subject?, entityType?, entityId?, topic?, refresh? }
 *
 * Gated exactly like the notices endpoints: org admins and seated board members.
 * Planning is board business — a plan names other people's arrears.
 */

import { randomUUID } from "node:crypto";
import { readItems } from "@directus/sdk";
import { MODEL_TIERS } from "#core/shared/ai/credits";
import { getLlmProvider } from "#core/server/utils/llm/provider";
import { getActionTools } from "#core/server/utils/llm/tools";
import { proposeAction } from "#core/server/utils/ai-actions";
import { getOrgAutonomyTier } from "#core/server/utils/ai-autonomy";
import { VOICE_CHARTER } from "#core/server/utils/llm/voice";
import {
  collectDirectorAgenda,
  type AINotice,
  type DirectorAgenda,
  type DirectorSubjectKey,
} from "#core/server/utils/ai-notices";
import { buildMoneyIntel } from "#core/server/utils/director-intel";
import {
  directorBriefingCacheKey,
  loadLatestDirectorBriefing,
  saveDirectorBriefing,
  splitTldr,
  type DirectorBriefingScope,
} from "#core/server/utils/director-briefings";
import { loadPlanSteps } from "#core/server/utils/director-sessions";

/**
 * The four tools the Board Room may reach for — one per category in
 * `ACTION_CATALOG`, which is what makes the set principled rather than a
 * favourite-picking exercise:
 *
 *   create_task           internal      — the universal next step
 *   update_request_status record_update — move a real ticket along
 *   schedule_meeting      scheduling    — governance work is meeting-shaped
 *   send_email            comms         — OUTBOUND, and therefore the one that
 *                                         proves the cap: it can be proposed
 *                                         from here, and it can never auto-run
 *                                         from here.
 *
 * Deliberately narrow. Every other catalog action needs context a plan does not
 * reliably have (a vendor id, a staff email address), and a step that cannot be
 * executed on approval is worse than a step that was never proposed.
 */
export const DIRECTOR_TOOL_NAMES = [
  "create_task",
  "update_request_status",
  "schedule_meeting",
  "send_email",
] as const;

/** Notice entity type → the collection an id belongs to, for grounding steps. */
const ENTITY_COLLECTION: Record<string, string> = {
  request: "hoa_requests",
  member: "hoa_members",
  project: "hoa_projects",
  channel: "hoa_channels",
  vendor: "hoa_vendors",
  meeting: "hoa_meetings",
  payment_request: "payment_requests",
};

const SUBJECT_LABEL: Record<string, string> = {
  requests: "requests and tickets",
  money: "the association's money",
  projects: "projects and maintenance work",
  community: "community and communications",
  vendors: "vendors",
  meetings: "meetings and governance",
  operations: "day-to-day operations",
};

/** How many notices are put in front of the model. Enough to reason, not enough to drown. */
const CONTEXT_NOTICE_LIMIT = 15;

/** Board Room plans think; they run on the standard tier, not the fast one. */
const PLAN_MODEL = MODEL_TIERS.standard;

function agendaNotices(agenda: DirectorAgenda, subject: string): AINotice[] {
  if (!subject) return agenda.groups.flatMap((g) => g.notices);
  const group = agenda.groups.find((g) => g.subject === (subject as DirectorSubjectKey));
  return group ? group.notices : [];
}

/** A compact record of what the plan was grounded in, saved with the briefing. */
function agendaDigest(agenda: DirectorAgenda) {
  return {
    mode: agenda.mode,
    totalNotices: agenda.totalNotices,
    totalProposed: agenda.totalProposed,
    groups: agenda.groups.map((g) => ({
      subject: g.subject,
      label: g.label,
      topPriority: g.topPriority,
      count: g.notices.length,
    })),
  };
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthenticatedUser(event);

  const body = ((await readBody(event).catch(() => ({}))) || {}) as {
    orgId?: string;
    subject?: string;
    entityType?: string;
    entityId?: string;
    topic?: string;
    refresh?: boolean;
  };

  const orgId = String(body.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });

  const directus = getTypedDirectus();

  // Authorization first — before a single row of this community is read.
  const admin = await checkAdminAccess(event, orgId);
  const allowed = admin.isAdmin || (await isActiveBoardMember(directus, userId, orgId));
  if (!allowed) {
    throw createError({ statusCode: 403, message: "Admin or board access required" });
  }

  const subject = String(body.subject || "").trim();
  const entityType = String(body.entityType || "").trim();
  const entityId = String(body.entityId || "").trim();
  const topic = String(body.topic || "").trim();
  const isEntity = !!entityType && !!entityId;

  const scope: DirectorBriefingScope = {
    scopeType: isEntity ? "entity" : "org",
    entityType: isEntity ? entityType : null,
    entityId: isEntity ? entityId : null,
    subject: subject || null,
    topic: topic || null,
  };
  const cacheKey = directorBriefingCacheKey(scope);

  // ── The cheap path: a briefing already drafted for this exact section ──────
  // Its steps are re-read live rather than replayed from the saved row, so a
  // step approved since the draft shows as approved.
  if (body.refresh !== true) {
    const cached = await loadLatestDirectorBriefing(orgId, scope);
    if (cached) {
      return {
        planId: cached.planId,
        cacheKey,
        cached: true,
        savedAt: cached.savedAt,
        subject: subject || null,
        entityType: isEntity ? entityType : null,
        entityId: isEntity ? entityId : null,
        intro: cached.intro,
        points: cached.points,
        money: cached.money,
        agenda: cached.agenda,
        steps: await loadPlanSteps(cached.planId, orgId),
        stepCount: cached.stepCount,
        credits: 0,
      };
    }
  }

  // ── Metering gate, before any tokens are spent ─────────────────────────────
  const wallet = await getWalletSummary(orgId);
  if (wallet.balanceCredits <= 0) {
    setResponseStatus(event, 402);
    return { error: "insufficient_credits", balanceCredits: 0 };
  }

  // Fails fast and friendly (503) when ANTHROPIC_API_KEY is unset.
  const llm = getLlmProvider();

  // ── Grounding ─────────────────────────────────────────────────────────────
  const now = new Date();
  const agenda = await collectDirectorAgenda(
    directus,
    orgId,
    now,
    isEntity ? { entityType, entityId } : undefined
  );
  const notices = isEntity
    ? agenda.groups.flatMap((g) => g.notices)
    : agendaNotices(agenda, subject);

  const contextLines = notices.slice(0, CONTEXT_NOTICE_LIMIT).map((n) => {
    const collection = n.entityType ? ENTITY_COLLECTION[n.entityType] || n.entityType : null;
    const target = collection && n.entityId ? ` [target: ${collection} id=${n.entityId}]` : "";
    return `- (${n.priority}) ${n.title} — ${n.description}${target}`;
  });
  const contextBlock = contextLines.length
    ? contextLines.join("\n")
    : "(Nothing is currently flagged for attention in this area.)";

  // Money mode gets the position as well as the exceptions.
  const isMoney = subject === "money" || entityType === "payment_request";
  const money = isMoney ? await buildMoneyIntel(directus, orgId, now) : null;

  let orgName: string | null = null;
  try {
    const rows = (await directus.request(
      readItems("hoa_organizations", {
        filter: { id: { _eq: orgId } },
        fields: ["name"],
        limit: 1,
      })
    )) as { name?: string }[];
    orgName = rows?.[0]?.name ?? null;
  } catch {
    /* the briefing reads fine without a name */
  }

  const scopeLabel = isEntity
    ? `one ${entityType.replace(/_/g, " ")} in particular`
    : subject
      ? SUBJECT_LABEL[subject] || `the "${subject}" area`
      : "the association as a whole";

  const allTools = getActionTools();
  const tools = allTools.filter((t) =>
    (DIRECTOR_TOOL_NAMES as readonly string[]).includes(t.name)
  );

  const systemPrompt = [
    VOICE_CHARTER,
    "",
    `You are the assistant for ${orgName ? `${orgName}, ` : ""}a community association, convening a short working session with its board.`,
    // The slide bullets lead, they do not trail. Asked for LAST, they are
    // reliably dropped: the model finishes its prose and goes straight to
    // emitting tool calls, and the closing instruction never gets its turn —
    // observed twice against the live model before this was moved. Asked for
    // FIRST, they are simply how the reply opens. `splitTldr()` reads the
    // marker wherever it lands, so the parser did not have to change.
    `START your reply with ONE line beginning EXACTLY "TL;DR:" followed by 2 to 4 takeaways separated by " | " (space, pipe, space). Each takeaway is 10 words or fewer, plain text, self-contained — these are shown verbatim as the session's slide bullets.`,
    "Then, on the following lines, write a BRIEF, plain-prose briefing on the scope below — what is actually going on, what matters most, and why. No markdown headings, no bold, no bullet characters. A few sharp sentences, not an essay.",
    ...(isMoney
      ? [
          "MONEY MODE — this session is about the association's finances. Cover, in this order and each on its own line:",
          "  Collected: what has come in, and whether the trend is up, flat or down. Use the real months below.",
          "  Spent: where the money goes, naming the biggest categories.",
          "  Owed: what members still owe, and how old it is. Name who carries the most.",
          "  Verdict: an honest read. If reserves are thin or arrears are aging badly, say so plainly. If the position is sound, say that.",
          money
            ? "  Every figure you cite must appear in the FINANCIAL POSITION block. Round to whole dollars."
            : "  NO financial records are available for this association. Do not estimate, project, or infer any dollar figure — say plainly that the financials are not on record and that recording payments and expenses is the first step.",
          "  If the block names something as NOT ON RECORD, say so rather than filling the gap with a plausible number.",
        ]
      : []),
    "",
    "Then propose 2 to 4 concrete next steps — never more than 5 — as tool calls, ALL in this same turn. Do not ask a follow-up question first.",
    `You may ONLY use these tools: ${DIRECTOR_TOOL_NAMES.join(", ")}.`,
    "Every step is a PROPOSAL a person must approve. Nothing you call happens on its own, so describe the plan as proposed, never as done.",
    "Ground each step in the items listed below and use the EXACT id shown in its [target: …] marker. Never invent an id. If a step would need an id you were not given, make it a task that describes the work instead.",
    "Each step must be distinct. If several records share one problem, address them in a SINGLE task rather than one task per record.",
    "send_email reaches residents. Propose it only when contacting people is genuinely the next step, and write the body as a finished, sendable message — a person will read it before anything is sent.",
    "",
    `Remember the shape: the "TL;DR:" line, then the briefing prose, then the tool calls.`,
  ]
    .filter(Boolean)
    .join("\n");

  const userMessage = [
    `Scope of this session: ${scopeLabel}.`,
    topic ? `The board specifically wants to focus on: ${topic}` : "",
    "",
    money ? `${money.text}\n` : "",
    "Currently needing attention:",
    contextBlock,
    "",
    "Give the briefing, then draft the steps as tool calls.",
  ]
    .filter(Boolean)
    .join("\n");

  // ── The model ─────────────────────────────────────────────────────────────
  const planId = randomUUID();
  const usage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
  const addUsage = (u: any) => {
    usage.input_tokens += u?.input_tokens ?? 0;
    usage.output_tokens += u?.output_tokens ?? 0;
    usage.cache_read_input_tokens += u?.cache_read_input_tokens ?? 0;
    usage.cache_creation_input_tokens += u?.cache_creation_input_tokens ?? 0;
  };

  let text = "";
  let toolCalls: { name: string; input: Record<string, any> }[] = [];
  try {
    // First pass: `auto`, so the briefing can lead with its prose AND emit
    // steps in the same turn.
    const first = await llm.completeWithTools({
      model: PLAN_MODEL,
      maxTokens: isMoney ? 3500 : 2048,
      system: [{ text: systemPrompt, cache: true }],
      messages: [{ role: "user", content: userMessage }],
      tools,
      toolChoice: "auto",
    });
    addUsage(first.usage);
    text = first.text || "";
    toolCalls = first.toolCalls;

    // A model that answers with an outline and no tool calls leaves a plan with
    // no steps — a briefing pretending to be a plan. Force a second pass that
    // must call a tool, and keep the first pass's prose as the briefing since
    // the forced pass emits tool calls only.
    if (toolCalls.length === 0) {
      console.warn("[ai/director/plan] first pass emitted no steps — forcing tool use");
      const forced = await llm.completeWithTools({
        model: PLAN_MODEL,
        maxTokens: 2048,
        system: [{ text: systemPrompt, cache: true }],
        messages: [
          { role: "user", content: userMessage },
          ...(text ? [{ role: "assistant" as const, content: text }] : []),
          {
            role: "user" as const,
            content:
              "Now emit each concrete next step as a tool call. Tool calls only — no prose.",
          },
        ],
        tools,
        toolChoice: "any",
      });
      addUsage(forced.usage);
      toolCalls = forced.toolCalls;
      if (!text) text = forced.text || "";
    }
  } catch (err: any) {
    console.error("[ai/director/plan] LLM error:", err?.message || err);
    throw createError({
      statusCode: 502,
      message: "The assistant could not draft a plan right now. Please try again.",
    });
  }

  // ── Steps → real proposals, through the one approval path ─────────────────
  const autonomyTier = await getOrgAutonomyTier(orgId);
  const steps: Array<{
    actionId: string | null;
    actionType: string;
    status: string;
    summary: string;
  }> = [];
  const skipped: Array<{ actionType: string; reason: string }> = [];

  for (const call of toolCalls) {
    // An off-list tool name cannot happen through the API, but a plan is the
    // wrong place to find out — the allow-list is re-checked before anything is
    // written, the same belt-and-braces the notices door uses.
    if (!(DIRECTOR_TOOL_NAMES as readonly string[]).includes(call.name)) {
      skipped.push({ actionType: call.name, reason: "not a Board Room step" });
      continue;
    }
    const res = await proposeAction(call.name, call.input || {}, {
      orgId,
      userId,
      sessionId: planId,
      entityType: isEntity ? entityType : null,
      entityId: isEntity ? entityId : null,
      autonomyTier,
    });
    if (res.success && res.actionId) {
      steps.push({
        actionId: res.actionId,
        actionType: call.name,
        status: res.status ?? "pending",
        summary: res.summary,
      });
    } else {
      // A step that could not be queued is dropped, not fatal — the rest of the
      // plan still stands, and the caller is told what fell out.
      skipped.push({ actionType: call.name, reason: res.error || "could not be proposed" });
      console.warn("[ai/director/plan] step skipped:", call.name, res.error);
    }
  }

  // ── Meter, then persist ───────────────────────────────────────────────────
  const charge = await chargeForCompletion({
    orgId,
    userId,
    usage,
    model: PLAN_MODEL,
    feature: "plan",
  });

  const { intro, points } = splitTldr(text);
  const moneyDigest = money
    ? {
        summary: money.summary,
        months: money.months,
        aging: money.aging,
        topDebtors: money.topDebtors,
        topExpenseCategories: money.topExpenseCategories,
        gaps: money.gaps,
      }
    : null;

  await saveDirectorBriefing({
    ...scope,
    organizationId: orgId,
    userId,
    planId,
    intro,
    points,
    money: moneyDigest,
    agenda: agendaDigest(agenda),
    stepCount: steps.length,
  });

  return {
    planId,
    cacheKey,
    cached: false,
    savedAt: null,
    subject: subject || null,
    entityType: isEntity ? entityType : null,
    entityId: isEntity ? entityId : null,
    intro,
    points,
    money: moneyDigest,
    agenda: agendaDigest(agenda),
    // Read back through the same function the cached path uses, so a plan looks
    // identical whether it was just drafted or reopened tomorrow.
    steps: await loadPlanSteps(planId, orgId),
    stepCount: steps.length,
    skipped,
    credits: charge.credits,
    balanceCredits: charge.balanceCredits,
  };
});

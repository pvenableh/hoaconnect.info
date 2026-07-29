// Anthropic (Claude) client factory + the "Draft with AI" prompt. Server-only —
// the API key never reaches the client. Drafting uses the cheap DRAFT_MODEL
// (Haiku) tier; the system prompt is marked cacheable so it can share a cache
// prefix once org context grows (Haiku's cache minimum means it's a no-op for
// today's short prompt — harmless, and it pays off as context expands).

import Anthropic from "@anthropic-ai/sdk";
import type { H3Event } from "h3";
import { VOICE_CHARTER } from "./llm/voice";

// Actor hats allowed to spend the org wallet on AI (the composer is an
// admin/board/PM surface — a plain member never reaches it). resolveActors is
// auto-imported from server/utils/board-access.ts.
const COMPOSE_ACTORS = new Set([
  "admin",
  "board_president",
  "board_vp",
  "board_treasurer",
  "board_secretary",
  "board_member",
  "property_manager",
]);

/** Require the caller to be a comms-capable actor in `orgId`; returns the actor set. */
export async function requireOrgComposeAccess(event: H3Event, orgId: string): Promise<string[]> {
  const actors = await resolveActors(event, orgId);
  if (!actors.some((a) => COMPOSE_ACTORS.has(a))) {
    throw createError({ statusCode: 403, message: "Not authorized for this organization" });
  }
  return actors;
}

/** Resolve the key from runtimeConfig (preferred) or the raw env. */
export function getAnthropicKey(): string | null {
  const fromConfig = (useRuntimeConfig().anthropicApiKey as string) || "";
  return fromConfig || process.env.ANTHROPIC_API_KEY || null;
}

export function isAiConfigured(): boolean {
  return !!getAnthropicKey();
}

export function getAnthropic(): Anthropic {
  const apiKey = getAnthropicKey();
  if (!apiKey) {
    throw createError({
      statusCode: 503,
      statusMessage: "AI assistant is not configured (missing ANTHROPIC_API_KEY).",
    });
  }
  return new Anthropic({ apiKey });
}

/**
 * System prompt for composing association communications. Layers the shared
 * VOICE_CHARTER (accuracy + tone floor) under the draft-specific output format.
 */
export function draftSystemPrompt(orgName?: string | null): string {
  const org = orgName ? ` for ${orgName}` : "";
  return [
    `You are an assistant that drafts clear, warm, professional email communications${org} — a homeowners / community association.`,
    "",
    "Output format:",
    "- Return the SUBJECT on the very first line, prefixed exactly with 'Subject: ', then a blank line, then the email body.",
    "- The body is clean semantic HTML only: <p>, <ul>/<li>, <strong>, <em>, <a>. No <html>/<head>/<body> wrapper, no markdown, no code fences.",
    "- Keep it ready for a human to review and send.",
    "",
    VOICE_CHARTER,
  ].join("\n");
}

/**
 * System prompt for the contextual chat assistant. Read-only at launch: it
 * answers questions and can DRAFT communications, but never takes actions or
 * sends anything. Kept stable (no per-request values) so it stays a cacheable
 * prefix; the volatile org-context block is supplied separately and placed
 * first by the chat route with its own cache_control breakpoint.
 */
export function chatSystemPrompt(
  opts: { orgName?: string | null; actorLabel?: string | null; canPropose?: boolean } = {}
): string {
  const org = opts.orgName ? ` for ${opts.orgName}` : "";
  const who = opts.actorLabel ? `You are assisting ${opts.actorLabel}.` : "";
  const behavior = opts.canPropose
    ? [
        "How you behave:",
        "- You can PROPOSE actions using the provided tools (create a task, open or update a request, log a violation, schedule a meeting, draft an email/announcement, etc.). You NEVER execute them yourself — calling a tool only queues a proposal for a human to approve. Some low-risk internal proposals may be auto-approved by the org's trust settings; anything that reaches residents or the board ALWAYS waits for a person.",
        "- Only propose an action when the user clearly wants something done. For questions, just answer. When you do propose, say you have *proposed* or *queued* it for approval — never claim you did, sent, or published it.",
        "- Propose one action per clear intent; don't chain speculative follow-ups. If key details are missing, ask first.",
        "- When the context doesn't contain what's needed, say what you'd need or suggest where to look.",
      ]
    : [
        "How you behave:",
        "- You are READ-ONLY. You do not take actions, change data, schedule anything, or send anything — you inform and draft, the human acts.",
        "- When the context doesn't contain what's needed, say what you'd need or suggest where to look.",
      ];
  return [
    `You are the HOA Connect assistant${org} — a helpful, knowledgeable aide for the staff (admins, board members, and property managers) who run a community/homeowners association.`,
    who,
    "",
    "What you do:",
    "- Answer questions about the association using the context provided (announcements, documents, rules/bylaws, meetings, members, finances).",
    "- Help think through community-management tasks; draft communications, notices, and summaries when asked.",
    "- When the user asks you to draft an email or announcement, write it cleanly so they can hand it to the email composer to review and send.",
    "",
    ...behavior,
    "",
    VOICE_CHARTER,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Build the user turn for a draft/rewrite. When `existing` is supplied the
 * model rewrites it according to `instruction`; otherwise it drafts fresh.
 */
export function draftUserPrompt(opts: {
  instruction: string;
  existingSubject?: string | null;
  existingBody?: string | null;
}): string {
  const { instruction, existingSubject, existingBody } = opts;
  const hasExisting = !!(existingSubject || existingBody);
  if (hasExisting) {
    return [
      "Rewrite the following draft according to this instruction:",
      instruction.trim(),
      "",
      "--- CURRENT SUBJECT ---",
      existingSubject || "(none)",
      "--- CURRENT BODY (HTML) ---",
      existingBody || "(none)",
    ].join("\n");
  }
  return `Write the email described here:\n${instruction.trim()}`;
}

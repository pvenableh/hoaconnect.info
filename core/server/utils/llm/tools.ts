// The Anthropic tool schemas for the assistant's HITL actions (Phase 4 — see
// docs/plan-earnest-parity-upgrade.md). One tool per ACTION_CATALOG entry; the
// tool name IS the action key, and the description is pulled from the catalog so
// the model's understanding and our proposal card stay in lockstep.
//
// EVERY tool is a PROPOSAL: calling one writes a `pending` ai_actions row, never
// a direct mutation. The trust dial (shouldAutoApprove) may auto-run a pending
// row, but outbound actions never auto-run. So the model is charter-bound to say
// it *proposed* an action, and the human (or the dial) decides.
//
// The model is told to omit ids for the record the user is looking at — the
// server resolves those from the focused entity — and to only pass an explicit
// id when it appears verbatim in the provided context.

import { ACTION_CATALOG, actionByKey } from "#core/shared/ai/actions";
import type { ToolDefinition } from "./types";

type Props = Record<string, any>;

/** Per-action JSON-schema properties + required list. Keyed by action key. */
const ACTION_INPUTS: Record<string, { properties: Props; required?: string[] }> = {
  create_task: {
    properties: {
      title: { type: "string", description: "Short task title." },
      description: { type: "string", description: "Optional detail." },
      priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
      due_date: { type: "string", description: "Due date, YYYY-MM-DD." },
      project_id: { type: "string", description: "Attach to this project (only if the id is in context)." },
      request_id: { type: "string", description: "Attach to this request/ticket (only if the id is in context)." },
    },
    required: ["title"],
  },
  add_comment: {
    properties: {
      body: { type: "string", description: "The note text." },
      target_collection: {
        type: "string",
        enum: ["hoa_requests", "hoa_projects", "hoa_announcements", "hoa_meetings"],
        description: "What kind of record to note on. Omit to use the record in view.",
      },
      target_id: { type: "string", description: "The record's id. Omit to use the record in view." },
      is_internal: { type: "boolean", description: "Board/admin-only note (default true)." },
    },
    required: ["body"],
  },
  create_request: {
    properties: {
      title: { type: "string" },
      type: { type: "string", enum: ["maintenance", "arc", "violation", "complaint", "task"] },
      description: { type: "string" },
      priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
      member_id: { type: "string", description: "Subject member (only if the id is in context)." },
    },
    required: ["title", "type"],
  },
  update_request_status: {
    properties: {
      request_id: { type: "string", description: "Omit to use the request in view." },
      status: { type: "string", enum: ["open", "in_progress", "waiting", "resolved", "closed"] },
    },
    required: ["status"],
  },
  assign_request: {
    properties: {
      request_id: { type: "string", description: "Omit to use the request in view." },
      assignee_email: { type: "string", description: "Email of the staff member to assign." },
    },
    required: ["assignee_email"],
  },
  update_member_field: {
    properties: {
      member_id: { type: "string", description: "Omit to use the member in view." },
      field: { type: "string", enum: ["phone", "email", "company"], description: "Which contact field to change." },
      value: { type: "string", description: "The new value." },
    },
    required: ["field", "value"],
  },
  log_violation: {
    properties: {
      title: { type: "string", description: "Short description of the violation." },
      description: { type: "string" },
      member_id: { type: "string", description: "The member/unit in violation (only if the id is in context)." },
      priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
    },
    required: ["title"],
  },
  assign_vendor: {
    properties: {
      project_id: { type: "string", description: "Omit to use the project in view." },
      vendor_id: { type: "string", description: "The vendor to attach (only if the id is in context)." },
      role: { type: "string", description: "The vendor's role on the project." },
    },
    required: ["vendor_id"],
  },
  schedule_meeting: {
    properties: {
      title: { type: "string" },
      meeting_date: { type: "string", description: "Date/time, ISO 8601." },
      type: { type: "string", enum: ["board", "committee", "annual", "special", "other"] },
      location: { type: "string" },
      agenda: { type: "string" },
    },
    required: ["title", "meeting_date"],
  },
  set_due_date: {
    properties: {
      task_id: { type: "string", description: "The task to set a due date on (only if the id is in context)." },
      request_id: { type: "string", description: "The request to set a due date on. Omit both to use the record in view." },
      due_date: { type: "string", description: "Due date, YYYY-MM-DD." },
    },
    required: ["due_date"],
  },
  send_email: {
    properties: {
      subject: { type: "string" },
      body_html: { type: "string", description: "Clean HTML body (<p>, <ul>, <strong>, <a>). No wrapper tags." },
      audience: { type: "string", enum: ["all", "owners", "tenants"], description: "Who it goes to (default all)." },
    },
    required: ["subject", "body_html"],
  },
  post_announcement: {
    properties: {
      title: { type: "string" },
      content: { type: "string", description: "Announcement body (HTML or plain text)." },
      announcement_type: { type: "string", enum: ["general", "urgent", "maintenance", "event", "reminder"] },
    },
    required: ["title", "content"],
  },
  notify_board: {
    properties: {
      subject: { type: "string" },
      body: { type: "string", description: "The message to the board (HTML or plain text)." },
    },
    required: ["subject", "body"],
  },
};

/** The tool schemas the model may call, derived from the action catalog. */
export function getActionTools(): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  for (const action of ACTION_CATALOG) {
    const input = ACTION_INPUTS[action.key];
    if (!input) continue; // catalog entry without a wired schema — skip
    tools.push({
      name: action.key,
      description: action.description,
      input_schema: {
        type: "object",
        properties: input.properties,
        ...(input.required ? { required: input.required } : {}),
      },
    });
  }
  return tools;
}

/** Whether a tool name is a known, catalogued action. */
export function isKnownAction(name: string): boolean {
  return !!actionByKey(name) && !!ACTION_INPUTS[name];
}

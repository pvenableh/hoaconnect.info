# Scope: notice acknowledgments and forms to sign

Status: scoped, not built. Two items in `docs/plan-unified-experience.md` §5 are marked
*pending feature* because they have no data model: **notices to acknowledge**
(Tenant) and **forms to sign** (Owner). `core/shared/home/roles.ts` already keeps the
keys, and the home renders nothing for them until this ships. Nothing here changes
§9, which rules the schema out of the experience plan; this is its own task.

## What each one is

| | Notice acknowledgment | Form to sign |
|---|---|---|
| Who sees it | Tenants (and anyone a notice targets) | Owners (and whoever a form targets) |
| What the person does | Reads a notice and confirms they have seen it | Reads a form (document), signs it, optionally with a few fields |
| Home row | Needs you → "Acknowledge: <title>", swipe to acknowledge | Needs you → "Sign: <title>" |
| Admin needs | Who has not acknowledged, and a nudge | Who has not signed, a due date, the signed copy |

## Proposed data (two collections, one pattern)

Both are "an item sent to people, and a record per person".

- `hoa_notices` already exists as announcements (`hoa_announcements`). Add `requires_acknowledgment` (bool) and `ack_due` (date) to it rather than a new collection.
- `hoa_acknowledgments`: `organization`, `announcement`, `member`, `acknowledged_at`, `method` (`swipe` | `button`). Unique on (`announcement`, `member`).
- `hoa_forms`: `organization`, `title`, `document` (file), `audience` (owners | tenants | all), `due_date`, `status`.
- `hoa_form_signatures`: `organization`, `form`, `member`, `signed_at`, `signed_name`, `ip`, `user_agent`, `signed_file` (optional). Unique on (`form`, `member`).

Permissions follow the existing member rules: a member reads and creates only their own acknowledgment or signature; admins and board read all.

## Decisions (2026-11-21, Peter)

1. **Signature weight:** a typed name plus an audit trail (time, IP, browser). Drawn or third-party e-sign is out of scope until a customer asks.
2. **Audience:** set per form (owners, tenants, board or all), defaulting to owners. Notices default to everyone the announcement targets. The Tenant and Board homes in §5 of the plan get a "forms to sign" key too.
3. **Reminders:** use the reminder engine (`core/shared/reminders/rules.ts`) from the start, not home-only. An unacknowledged notice and an unsigned form each get a rule (a nudge a few days after sending, and again before the due date). Each UI step below ships its own rule, so nothing is left for later.
4. **Plan gating:** acknowledgments are free; forms to sign is gated by plan, using the existing entitlement code.

## Build order (each a session of about eight files)

1. Schema and permissions for acknowledgments, plus a pure `core/shared/home/acknowledgments.ts` (who still owes one) with tests.
2. Tenant home: the Needs-you row with swipe-to-acknowledge (uses `useSwipeRow`), an admin "who has not" list, and the acknowledgment reminder rule with its test.
3. Schema and permissions for forms and signatures, plus the pure outstanding-forms helper with tests.
4. Owner, tenant and board homes: the "Sign" row and a signing sheet (typed name, audit trail), the admin tracking list, the signed-copy download, and the form reminder rule with its test.
5. Plan gating for forms to sign: the entitlement check on creating a form and on the signing routes, an upgrade prompt for ungated plans, and a test per plan state.

Done when, for each: a seeded tenant or owner sees the row, acts in place, the row disappears, the admin list shows it done, and (steps 2 and 4) the reminder rule fires for someone who has not acted.

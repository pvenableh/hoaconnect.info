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

## Decisions Peter needs to make first

1. **Legal weight.** Is a typed-name signature enough, or does any form need a drawn signature or a third-party e-sign service? This decides whether `signed_file` and an audit trail are required.
2. **Audience.** Owners only, or also tenants and board for some forms?
3. **Reminders.** Reuse the reminder engine (`core/shared/reminders/rules.ts`) for unacknowledged and unsigned items, or home-only at first?
4. **Revenue.** Forms to sign is a plausible paid feature (see the platform revenue goal). Gate it by plan, or include it?

## Build order (each a session of about eight files)

1. Schema and permissions for acknowledgments, plus a pure `core/shared/home/acknowledgments.ts` (who still owes one) with tests.
2. Tenant home: the Needs-you row with swipe-to-acknowledge (uses `useSwipeRow`), and a "who has not" list for admins.
3. Schema and permissions for forms and signatures, plus the pure outstanding-forms helper with tests.
4. Owner home: the "Sign" row and a signing sheet; the admin tracking list and the signed-copy download.
5. Reminders and, if decided, plan gating.

Done when, for each: a seeded tenant or owner sees the row, acts in place, the row disappears, and the admin list shows it done.

# The data continuity policy

> **Your community owns everything it creates here. You can take it at any time,
> in a format you can actually use, without asking us.**

This is the plain-English version of that promise — the fourth item of
[VISION.md](VISION.md) Pillar A ("Continuity guarantee in writing"). It is
written to be quoted: a board can paste any section of it into an RFP, and a
property manager can hand it to a prospective client.

Two rules govern this document.

1. **It describes what the software does today**, not what is planned. Anything
   not yet built is in [What we don't promise yet](#what-we-dont-promise-yet) at
   the bottom, in the same plain language.
2. **The machine-readable version wins.** The list of what belongs to a
   community lives in [`core/shared/export/collections.ts`](../core/shared/export/collections.ts)
   as data, and a test fails the build if a new record type is added to the
   schema without a decision about who owns it. This page is generated from the
   same map where it counts — see `app/pages/your-data.vue` — so the two cannot
   drift apart quietly.

---

## 1. What belongs to your community

Every record your community creates in HOA Connect belongs to the association:
owners and units, board terms and meeting minutes, votes, dues and payments and
expenses, work orders, violations, vendor history, documents and photos, sent
email, your branding and your public site, your board's private channels, and
the full record of every AI action taken on your behalf.

It belongs to the association itself — not to the board member who typed it, not
to the management company that ran the account, and not to us. Boards turn over
and managers get replaced; the record does not move.

Three things in the same database are **not** the community's, and the export
says so explicitly rather than quietly omitting them:

| Not exported | Why |
| --- | --- |
| The management company's billing account and staff roster | The agency's own record. It travels with the manager. |
| The platform's pricing and discount catalogs | The same rows for every customer; nothing to do with your community. |
| Browser push tokens | Live credentials tied to one device. Useless anywhere else, and unsafe to copy. |

## 2. Taking it: the export

**Settings → Your data → Request export.** One button. No support ticket, no
approval from us, no fee, and no window in which it is unavailable — including
while you are in a dispute with your manager or with us.

**Who can ask.** An HOA Admin of the community. Deliberately not board members
and not property managers holding grants: the archive contains every owner's
contact details, the community's finances, and (in the full tier) the board's
private discussion.

**What you get.** A zip file:

```
README.txt          Plain English, written for a board member opening it a year from now
manifest.json       What's inside, how many rows, what was withheld and why
data/*.json         One file per record type — the complete rows, verbatim
csv/*.csv           Members, units, requests and the financial ledger as spreadsheets
files/              Every uploaded document and photo (optional — see below)
```

**Two versions, because "export" means two different things.**

- **Everything** — the complete record, including your board's private channels,
  comments, moderation history, portal activity and AI history. For your own
  archive.
- **Shareable** — the full *operational* record with the board's private
  deliberation removed. Safe to hand to an incoming management company on day
  one.

  Shareable still includes **per-owner delinquency** — balances, payment status,
  payment history. This is deliberate and is the point of the tier: a successor
  manager who can't see who is behind cannot do the job. A "handover" without it
  would be a courtesy, not a handover.

**Documents and photos are opt-in.** JSON and spreadsheets are always included.
The files archive is a checkbox because a community's storage can run to
hundreds of gigabytes, and most exports don't need it.

**Downloads last 7 days.** The archive is deleted after that; the record that you
requested it is kept. Request a new one whenever you want — there is no limit on
how many exports you take, or how often.

**You don't have to wait on the page.** The export is built by a background
worker, so a large community's archive finishes whether or not you close the
tab. You get a notification when it's ready.

## 3. What a property manager takes, and what stays

The line is drawn in the schema, not in a contract clause, and it is the same
line in both directions:

**Stays with the community, always:** owners, units, financials, requests,
violations, documents, meeting minutes, votes, vendor history for this
community, sent communications, the community's branding and public site.

**Travels with the manager:** their billing account and staff roster, and — as
that layer is built out — their own templates, playbooks, vendor rolodex and
agency-private notes. A manager's operating knowledge is theirs. A community's
record of itself is the community's.

**When a manager leaves,** the community keeps administrative control of its own
account. HOA Connect does not have a mode in which a departing manager takes the
community's data with them, or in which the community has to buy it back.

## 4. If you cancel

Cancelling ends your subscription. It does not end your ownership.

- **Your records are not deleted when you cancel.** They stay as they are.
- **Export stays available for at least 12 months** after the subscription ends.
  The export page and the export itself keep working; you don't need an active
  subscription to take your own data out.
- **We will not hold an export hostage** to an unpaid invoice, a dispute, or a
  renewal conversation. If you owe us money we will ask you for it like anyone
  else — not by sitting on your minutes.

**Deleting your data for good** is on request from an HOA Admin of the
community, and we'll confirm it in writing before we do it, because it cannot be
undone. We don't delete a community's records on our own schedule.

## 5. What we will never do

Stated plainly, because these are the specific things the incumbent products do:

- Charge a fee to export your own data, or make the price of leaving a
  negotiation.
- Provide the export only as a PDF, a screenshot, or a report nobody can import.
- Require your management company's approval for the community to get its own
  records.
- Make the export something you have to request from support, wait on, or
  escalate.
- Treat your data as the thing that keeps you from leaving.

## What we don't promise yet

Everything above is live today. These are honest gaps — they are on the roadmap
(VISION Pillar A), not in the product:

- **A guided management transition.** Today, replacing a management company means
  an admin promotes a board member, revokes the manager's access, and takes a
  shareable export by hand. The wizard that does this as one reviewed operation —
  with a grace period instead of an immediate cut-off and an immutable audit
  entry — is Phase 4.
- **The 12-month window is a commitment, not an automated retention rule.**
  Nothing in the code deletes a cancelled community's records at 12 months or at
  any other time. In practice you have more than we promise; we would rather
  promise the smaller number and keep it.
- **Agency-owned assets aren't a separate scope yet.** Templates and playbooks a
  manager creates inside a community currently belong to that community's export.
  Until `agency_assets` ships, the line in section 3 is drawn at the billing
  account.
- **The export is a snapshot, not an API.** There is no live feed or scheduled
  export to another system. If you need one, ask — it's a feature, not a policy
  problem.

---

*Questions about anything here go to peter@huestudios.com. If this document and
the software ever disagree, the software's behaviour is the bug — tell us and
we'll fix the software.*

/**
 * The sentence each register or board-term write leaves in `hoa_activity`
 * ("Treasurer ended on Reconciles bank statements; CPA added"). Pure, so the
 * wording is tested once and every route says it the same way.
 */
import { endReasonLabel, officeLabel } from "./config";

export const REGISTER_ACTIVITY = "responsibility";
export const BOARD_TERM_ACTIVITY = "board_term";

const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

export const sentences = {
  created: (job: string) => `Added the job ${job}`,
  updated: (job: string, fields: string[]) => `Updated ${job}${fields.length ? ` (${list(fields)})` : ""}`,
  verified: (job: string) => `Verified ${job}`,
  retired: (job: string, ended: string[]) =>
    `Retired ${job}${ended.length ? `; ${list(ended)} ended` : ""}`,
  added: (job: string, holder: string) => `${holder} added on ${job}`,
  handedOver: (job: string, from: string, to: string | null) =>
    to ? `${from} ended on ${job}; ${to} added` : `${from} ended on ${job}; nobody holds it now`,
  corrected: (job: string, holder: string, fields: string[]) =>
    `Corrected ${holder} on ${job}${fields.length ? ` (${list(fields)})` : ""}`,
  template: (count: number, label: string) =>
    count === 0 ? `Applied the ${label} list; every job was already there` : `Added ${count} job${count === 1 ? "" : "s"} from the ${label} list`,
  published: (on: boolean) => (on ? "Published the register to owners" : "Stopped publishing the register to owners"),
  showUnassigned: (on: boolean) =>
    on ? "Turned on showing unassigned jobs to owners" : "Turned off showing unassigned jobs to owners",

  termEnded: (person: string, office: string, reason: string) =>
    `${person}'s term as ${officeLabel(office)} ended (${endReasonLabel(reason).toLowerCase()})`,
  officeChanged: (person: string, from: string, to: string) =>
    `${person} moved from ${officeLabel(from)} to ${officeLabel(to)}`,
  termCorrected: (person: string, office: string, fields: string[]) =>
    `Corrected ${person}'s term as ${officeLabel(office)}${fields.length ? ` (${list(fields)})` : ""}`,
  termDeleted: (person: string, office: string) =>
    `Deleted ${person}'s term as ${officeLabel(office)}, entered by mistake`,
};

/** Field names as a sentence reads them. */
export const FIELD_WORDS: Readonly<Record<string, string>> = {
  title: "title",
  description: "description",
  category: "category",
  cadence: "cadence",
  basis: "basis",
  basis_reference: "basis reference",
  evidence: "files",
  area: "area",
  status: "status",
  last_verified: "last verified",
  member_visible: "owner visibility",
  project: "project",
  notes: "notes",
  sort: "order",
  role: "role",
  start_date: "start date",
  end_date: "end date",
  term_start: "start date",
  term_end: "end date",
  end_reason: "end reason",
  message: "message",
  icon: "icon",
};

export const fieldWords = (keys: string[]) => keys.map((k) => FIELD_WORDS[k] ?? k);

/**
 * What each helper area lets a helper or committee do, in the words the
 * admin's switches use (docs/spec-delegation.md). Shared by the member sheet,
 * the team page and the /ui-kit demo, so the promise is made in one place.
 * Each line says what stays with admins, because the switch is a delegation
 * and an admin should not believe they handed over more than they did.
 */
import type { HelperAreaKey } from "./area-grants";

export const HELPER_AREA_COPY: Readonly<Record<HelperAreaKey, { label: string; desc: string }>> = {
  inquiries: {
    label: "Inquiries",
    desc: "See every resident request, move it along, edit its details and spawn follow-up tasks. Internal notes and discussion channels stay with admins, the board and managers.",
  },
  directory: {
    label: "Directory",
    desc: "See every active member's email and phone, and approve or decline their contact, address, vehicle and pet changes. Editing members stays with admins.",
  },
  documents: {
    label: "Governing documents",
    desc: "Review, publish and correct the governing documents. Renaming, deleting and folders on the Documents page stay with admins.",
  },
  feedback: {
    label: "Community feedback",
    desc: "Create polls, see live results, and close or reopen them.",
  },
  projects: {
    label: "Projects",
    desc: "Create and run projects, milestones and tasks. Recording expenses stays with admins and managers.",
  },
  responsibilities: {
    label: "Responsibilities register",
    desc: "Add jobs, hand them over and export the register. Publishing it to owners stays with admins.",
  },
};

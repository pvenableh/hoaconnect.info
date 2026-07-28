// Pure route → focus mapping for the AI assistant. Maps a route path to a coarse
// section scope + a human "you're looking at the X area" sentence, mirroring the
// admin dock's section hubs (Dashboard · People · Money · Communications ·
// Settings) so the assistant's sense of "where am I" never drifts from the nav.
// Framework-free so it's unit-testable without a router. First match wins
// (specific → generic).

export interface RouteFocus {
  scope: string;
  focus: string;
}

const RULES: Array<[RegExp, string, string]> = [
  [/\/(vendors|property-management)(\/|$)/, "people", "the Vendors directory"],
  [/\/(members|residents|units)(\/|$)/, "people", "the People area — members and residents"],
  [/\/(requests|inquiries|violations|arc)(\/|$)/, "requests", "requests, tickets, and violations"],
  [/\/(projects|tasks)(\/|$)/, "work", "projects and tasks"],
  [/\/meetings(\/|$)/, "governance", "meetings and minutes"],
  [/\/(channels|messages)(\/|$)/, "communications", "channels and messaging"],
  [/\/(emails|communications|announcements)(\/|$)/, "communications", "communications"],
  [/\/(payments|money|billing|finance|reporting|expenses)(\/|$)/, "money", "money and reporting"],
  [/\/(documents|governance|files)(\/|$)/, "documents", "documents and governance"],
  [/\/settings(\/|$)/, "settings", "association settings"],
  [/\/(dashboard|admin)\/?$/, "dashboard", "the dashboard overview"],
];

export function deriveRouteFocus(path: string): RouteFocus {
  const p = (path || "").toLowerCase();
  for (const [re, scope, focus] of RULES) {
    if (re.test(p)) return { scope, focus };
  }
  return { scope: "workspace", focus: "the association workspace" };
}

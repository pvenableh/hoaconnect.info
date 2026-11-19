// useResponsibilitiesResource — the responsibilities register as a resource
// (docs/spec-responsibilities.md, docs/spec-resource-scaffold.md): the
// definition `useResource` runs on, and the register's writes.
//
// One read, GET /api/org/responsibilities, for editors and board seats: every
// job with its holders on the as-of date, the whole holder history, the two
// publishing switches and what the viewer may do. Nothing here reads the
// register from Directus: no policy does. Every write is a route too, and each
// route checks the caller again, so the page hiding a control is only courtesy.
//
// Shared by the register (`/admin/responsibilities`) and its panel, which passes
// `reuse: true` so opening a job over the index makes no second request.
import type { Ref } from "vue";
import type { RegisterRow } from "#core/shared/responsibilities/views";
import { registerSearchText } from "#core/shared/responsibilities/register-view";
import { rowInFocus } from "#core/shared/responsibilities/focus";
import type { ResourceDefinition } from "./useResource";
import { useResource } from "./useResource";

export interface RegisterMeta {
  asOf: string;
  visibility: { published: boolean; showUnassigned: boolean };
  viewer: { canEdit: boolean; isAdmin: boolean };
}

interface RegisterResponse extends RegisterMeta {
  responsibilities: RegisterRow[];
}

/** The job's own status, in the status tokens (one proven pair per mode). */
export const RESPONSIBILITY_STATUS_CLASS: Record<string, string> = {
  active: "bg-success/15 text-success",
  disputed: "bg-warning/15 text-warning",
  retired: "t-bg-subtle t-text-muted",
};

/** Today in the viewer's zone, as a date-only value. */
export const registerToday = () => new Date().toLocaleDateString("en-CA");

/** A date-only value as the day it is: "Nov 16, 2026". Reading it as midnight UTC would show Nov 15 west of UTC. */
export function registerDay(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = String(d).slice(0, 10).split("-").map(Number);
  if (!y || !m || !day) return "—";
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export const messageOf = (e: unknown, fallback: string): string => {
  const x = e as { data?: { message?: string }; statusMessage?: string; message?: string } | null;
  return x?.data?.message || x?.statusMessage || x?.message || fallback;
};

export function useResponsibilitiesResource(orgId: Ref<string | null | undefined>, opts: { reuse?: boolean } = {}) {
  // The as-of day the register is read for, shared by the index and its panel.
  const asOf = useState<string>("responsibilities:asOf", registerToday);
  const meta = useState<RegisterMeta | null>("responsibilities:meta", () => null);

  const def: ResourceDefinition<RegisterRow> = {
    key: "responsibilities",
    panel: "responsibility",
    load: async (id) => {
      const res = await $fetch<RegisterResponse>("/api/org/responsibilities", {
        query: { orgId: id, asOf: asOf.value || registerToday() },
      });
      meta.value = { asOf: res.asOf, visibility: res.visibility, viewer: res.viewer };
      return res.responsibilities;
    },
    search: registerSearchText,
    statuses: [
      { value: "current", label: "Current", match: (r) => r.status !== "retired" },
      { value: "disputed", label: "Disputed", match: (r) => r.status === "disputed" },
      { value: "retired", label: "Retired", match: (r) => r.status === "retired" },
      { value: "all", label: "All" },
    ],
    filters: {
      category: { initial: "all", match: (r, v) => r.category === v },
      // The register's focus (Session 18): the page keeps both in the URL
      // (useRegisterFocus) and mirrors them here, so the Grid and the Map agree.
      holder: { initial: "any", match: (r, v) => rowInFocus(r, { holder: v, unassigned: true }) },
      unassigned: { initial: "show", match: (r) => rowInFocus(r, { holder: null, unassigned: false }) },
      basis: { initial: "any", match: (r) => (r.basis || "unknown") === "unknown" },
      review: { initial: "any", match: (r) => r.reviewOverdue },
    },
  };

  const resource = useResource(def, { orgId, reuse: opts.reuse });

  const viewer = computed(() => meta.value?.viewer ?? { canEdit: false, isAdmin: false });
  const visibility = computed(() => meta.value?.visibility ?? { published: false, showUnassigned: false });
  const asOfIsToday = computed(() => !asOf.value || asOf.value === registerToday());

  /** Read the register as it stood on another day. */
  async function setAsOf(day: string | null | undefined) {
    asOf.value = day || registerToday();
    await resource.refresh();
  }

  // ── Writes ────────────────────────────────────────────────────────────────
  // Each is one route; each toasts the result and re-reads, so the index and an
  // open panel both show it. They return whether it went through, so a sheet
  // stays open (with the route's own words) when it did not.
  async function send(
    path: string,
    method: "POST" | "PATCH",
    body: Record<string, unknown>,
    done: string | ((r: any) => string),
  ): Promise<boolean> {
    const { toast } = await import("vue-sonner");
    try {
      const r = await $fetch(path, { method, body: { orgId: orgId.value, ...body } });
      toast.success(typeof done === "function" ? done(r) : done);
      await resource.refresh();
      return true;
    } catch (e) {
      toast.error(messageOf(e, "Couldn't save that change"));
      return false;
    }
  }

  const base = "/api/org/responsibilities";
  const createJob = (body: Record<string, unknown>) => send(base, "POST", body, "Job added");
  const patchJob = (id: string, body: Record<string, unknown>, done = "Job updated") => send(`${base}/${id}`, "PATCH", body, done);
  const markVerified = (id: string) => patchJob(id, { last_verified: registerToday() }, "Marked verified today");
  const retireJob = (id: string, effective?: string) => send(`${base}/${id}/retire`, "POST", { effective }, "Job retired");
  const addHolder = (id: string, body: Record<string, unknown>) => send(`${base}/${id}/assignees`, "POST", body, "Holder added");
  const correctHolder = (assigneeId: string, body: Record<string, unknown>) =>
    send(`${base}/assignees/${assigneeId}`, "PATCH", body, "Row corrected");
  const handOver = (id: string, body: Record<string, unknown>) =>
    send(`${base}/${id}/hand-over`, "POST", body, () => (body.next ? "Handed over" : "Holder ended"));
  const applyTemplate = (template: string) =>
    send(`${base}/apply-template`, "POST", { template }, (r) =>
      r?.created ? `Added ${r.created} ${r.created === 1 ? "job" : "jobs"}${r.skipped ? ` (${r.skipped} already there)` : ""}` : "Every job on that list is already here",
    );
  const setVisibility = (body: { published?: boolean; showUnassigned?: boolean }) =>
    send(`${base}/visibility`, "PATCH", body, "Visibility updated");

  return {
    resource,
    meta,
    viewer,
    visibility,
    asOf,
    asOfIsToday,
    setAsOf,
    createJob,
    patchJob,
    markVerified,
    retireJob,
    addHolder,
    correctHolder,
    handOver,
    applyTemplate,
    setVisibility,
  };
}

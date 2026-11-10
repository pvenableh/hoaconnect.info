/**
 * An in-memory RecipientStore and a fake SendGrid for the send queue's tests
 * (docs/spec-email-send-queue.md §10). The store keeps Directus' two
 * properties the design leans on: a unique index refuses a second lease (and a
 * duplicate dedupe_key, all-or-nothing per batch), and every filter-update is
 * applied only where its filter still matches. It runs in microseconds, so the
 * kill matrix can replay whole sends.
 */
import type {
  EmailQueueState,
  Lease,
  LiveMember,
  NewRow,
  QueueRow,
  RecipientStore,
  Settlement,
  StatusCounts,
} from "#core/server/utils/email-send-queue";

export const notUnique = () =>
  Object.assign(new Error("Value has to be unique"), { errors: [{ extensions: { code: "RECORD_NOT_UNIQUE" } }] });
export const busyError = () => Object.assign(new Error("Service Unavailable"), { response: { status: 503 } });

export type EmailRow = EmailQueueState & Record<string, any>;

export class MemoryStore implements RecipientStore {
  rows = new Map<string, QueueRow>();
  leases = new Map<string, Lease>();
  emails = new Map<string, EmailRow>();
  members = new Map<string, LiveMember>();
  calls: string[] = [];
  /** Throw this error from the named method, `times` times (default once). */
  faults: Array<{ method: keyof RecipientStore; error: unknown; times?: number }> = [];
  private seq = 0;

  private maybeFail(method: keyof RecipientStore) {
    this.calls.push(method);
    const f = this.faults.find((x) => x.method === method && (x.times ?? 1) > 0);
    if (f) {
      f.times = (f.times ?? 1) - 1;
      throw f.error;
    }
  }

  // ── fixtures ──
  addEmail(e: Partial<EmailRow> & { id: string }) {
    this.emails.set(e.id, {
      status: "draft",
      send_run_key: null,
      total_recipients: null,
      send_started_at: null,
      send_finished_at: null,
      ...e,
    } as EmailRow);
  }
  addMember(m: LiveMember) {
    this.members.set(m.id, m);
  }
  rowsOf(emailId: string) {
    return [...this.rows.values()].filter((r) => r.email === emailId).sort((a, b) => a.position - b.position);
  }
  email(id: string) {
    return this.emails.get(id)!;
  }

  // ── leases ──
  async insertLease(lease: Omit<Lease, "id">) {
    this.maybeFail("insertLease");
    if ([...this.leases.values()].some((l) => l.email === lease.email)) throw notUnique();
    const row = { ...lease, id: `lease-${++this.seq}` };
    this.leases.set(row.id, row);
    return { ...row };
  }
  async readLease(emailId: string) {
    this.maybeFail("readLease");
    const l = [...this.leases.values()].find((x) => x.email === emailId);
    return l ? { ...l } : null;
  }
  async deleteLease(lease: Pick<Lease, "id" | "token">) {
    this.maybeFail("deleteLease");
    const l = this.leases.get(lease.id);
    if (l && l.token === lease.token) this.leases.delete(lease.id);
  }

  // ── rows ──
  async createRows(rows: NewRow[]) {
    this.maybeFail("createRows");
    const keys = new Set([...this.rows.values()].map((r) => r.dedupe_key));
    for (const r of rows) {
      if (keys.has(r.dedupe_key)) throw notUnique();
      keys.add(r.dedupe_key);
    }
    for (const r of rows) {
      const id = `row-${String(++this.seq).padStart(5, "0")}`;
      this.rows.set(id, { claim: null, claimed_at: null, ...r, id } as QueueRow);
    }
  }
  async deleteRows(emailId: string, runKey: string) {
    this.maybeFail("deleteRows");
    for (const [id, r] of this.rows) if (r.email === emailId && r.run_key === runKey) this.rows.delete(id);
  }
  async queued(emailId: string, runKey: string, limit: number) {
    this.maybeFail("queued");
    return [...this.rows.values()]
      .filter((r) => r.email === emailId && r.run_key === runKey && r.status === "queued")
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }
  async claim(emailId: string, runKey: string, ids: string[], token: string, at: string) {
    this.maybeFail("claim");
    for (const id of ids) {
      const r = this.rows.get(id);
      if (r && r.status === "queued") Object.assign(r, { status: "claimed", claim: token, claimed_at: at });
    }
    return [...this.rows.values()]
      .filter((r) => r.email === emailId && r.run_key === runKey && r.claim === token && r.status === "claimed")
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
      .map((r) => ({ ...r }));
  }
  async release(emailId: string, runKey: string, token: string, ids?: string[]) {
    this.maybeFail("release");
    for (const r of this.rows.values()) {
      if (r.email !== emailId || r.run_key !== runKey || r.claim !== token || r.status !== "claimed") continue;
      if (ids && !ids.includes(r.id)) continue;
      Object.assign(r, { status: "queued", claim: null, claimed_at: null });
    }
  }
  async expire(emailId: string, runKey: string, cutoff: string, message: string) {
    this.maybeFail("expire");
    let n = 0;
    for (const r of this.rows.values()) {
      if (r.email === emailId && r.run_key === runKey && r.status === "claimed" && (r.claimed_at ?? "") < cutoff) {
        Object.assign(r, { status: "unknown", error_message: message });
        n++;
      }
    }
    return n;
  }
  async settle(s: Settlement) {
    this.maybeFail("settle");
    for (const x of s.sent) Object.assign(this.rows.get(x.id)!, { status: "sent", sent_at: x.sentAt, sg_message_id: x.messageId, error_message: null });
    const conditional = (id: string, patch: Partial<QueueRow>) => {
      const r = this.rows.get(id);
      if (r && r.status === "claimed") Object.assign(r, patch);
    };
    for (const x of s.failed) conditional(x.id, { status: "failed", error_message: x.reason });
    for (const x of s.unknown) conditional(x.id, { status: "unknown", error_message: x.reason });
    for (const x of s.suppressed) conditional(x.id, { status: "suppressed", suppressed_reason: x.reason });
  }
  async counts(emailId: string, runKey: string): Promise<StatusCounts> {
    this.maybeFail("counts");
    const c: StatusCounts = { queued: 0, claimed: 0, sent: 0, failed: 0, suppressed: 0, unknown: 0 };
    for (const r of this.rows.values()) if (r.email === emailId && r.run_key === runKey) c[r.status]++;
    return c;
  }
  async failures(emailId: string, runKey: string, limit: number) {
    this.maybeFail("failures");
    return this.rowsOf(emailId)
      .filter((r) => r.run_key === runKey && (r.status === "failed" || r.status === "unknown"))
      .slice(0, limit)
      .map((r) => ({ recipient_email: r.recipient_email, error_message: r.error_message ?? null, status: r.status }));
  }

  // ── emails / members ──
  async readEmail(emailId: string) {
    this.maybeFail("readEmail");
    const e = this.emails.get(emailId);
    return e ? { ...e } : null;
  }
  async updateEmail(emailId: string, data: Record<string, unknown>) {
    this.maybeFail("updateEmail");
    Object.assign(this.emails.get(emailId)!, data);
  }
  async sendingEmails() {
    this.maybeFail("sendingEmails");
    return [...this.emails.values()]
      .filter((e) => e.status === "sending")
      .sort((a, b) => String(a.send_started_at).localeCompare(String(b.send_started_at)))
      .map((e) => ({ ...e }));
  }
  async liveMembers(ids: string[]) {
    this.maybeFail("liveMembers");
    return ids.map((id) => this.members.get(id)).filter(Boolean).map((m) => ({ ...m! }));
  }
}

/** A clock the test drives; `sleep` records instead of waiting. */
export function fakeClock(start = Date.parse("2026-11-03T12:00:00Z")) {
  const clock = {
    t: start,
    sleeps: [] as number[],
    now: () => clock.t,
    sleep: async (ms: number) => {
      clock.sleeps.push(ms);
    },
    advance: (ms: number) => {
      clock.t += ms;
    },
  };
  return clock;
}

/** A fake SendGrid: logs every acceptance; `script` answers per address (default 202). */
export function fakeSendGrid() {
  const sg = {
    accepted: [] as string[],
    calls: [] as string[],
    script: new Map<string, Array<number | "network">>(),
    async deliver(msg: { to: string }) {
      sg.calls.push(msg.to);
      const plan = sg.script.get(msg.to);
      const next = plan?.shift();
      if (next === "network") throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
      if (typeof next === "number" && next !== 202) {
        throw Object.assign(new Error(`HTTP ${next}`), { code: next, response: { body: { errors: [{ message: `status ${next}` }] } } });
      }
      sg.accepted.push(msg.to);
      return { messageId: `sg-${sg.accepted.length}` };
    },
  };
  return sg;
}

/** Trivial render deps: a draft is the row's address; finalize records the live token. */
export function simpleDeps(sg: ReturnType<typeof fakeSendGrid>, opts: { emailClass?: "essential" | "community"; prepareThrows?: boolean; failRows?: string[] } = {}) {
  const finalized: Array<{ rowId: string; token: string | null; kind: string }> = [];
  return {
    finalized,
    load: async () => ({
      emailClass: opts.emailClass ?? ("community" as const),
      prepare: async (rows: QueueRow[]) => {
        if (opts.prepareThrows) throw new Error("render exploded");
        const m = new Map<string, { draft: { to: string } } | { fail: string }>();
        for (const r of rows) {
          if (opts.failRows?.includes(r.recipient_email || "")) m.set(r.id, { fail: "Could not render: bad merge" });
          else m.set(r.id, { draft: { to: r.recipient_email || "" } });
        }
        return m;
      },
      finalize: (row: QueueRow, draft: { to: string }, live: LiveMember | null) => {
        finalized.push({ rowId: row.id, token: live?.unsubscribe_token ?? null, kind: row.kind });
        return { to: draft.to };
      },
    }),
    deliver: (msg: { to: string }) => sg.deliver(msg),
  };
}

/** Seed a sending email with `n` queued member rows (positions 1..n). */
export async function seedSending(store: MemoryStore, n: number, opts: { emailId?: string; runKey?: string; startedAt?: string } = {}) {
  const emailId = opts.emailId ?? "email-1";
  const runKey = opts.runKey ?? "m:2026-11-03T12:00:00.000Z";
  store.addEmail({
    id: emailId,
    status: "sending",
    send_run_key: runKey,
    total_recipients: n,
    send_started_at: opts.startedAt ?? "2026-11-03T12:00:00.000Z",
  });
  const rows: NewRow[] = [];
  for (let i = 1; i <= n; i++) {
    const id = `m-${i}`;
    store.addMember({ id, email: `p${i}@example.com`, unsubscribe_token: `tok-${i}` });
    rows.push({
      email: emailId,
      run_key: runKey,
      kind: "member",
      position: i,
      dedupe_key: `${emailId}:${runKey}:m:${id}`,
      member: id,
      recipient_email: `p${i}@example.com`,
      recipient_name: `Person ${i}`,
      status: "queued",
      member_fields: { first_name: `Person${i}` },
      copies: null,
    });
  }
  await store.createRows(rows);
  store.calls = [];
  return { emailId, runKey };
}

// ── A fake Directus for the route-level tests ───────────────────────────────

export const QUEUE_FIELDS_PROVISIONED: Record<string, string[]> = {
  hoa_members: ["id", "email", "email_community_opt_out", "email_community_opt_out_at", "email_community_opt_out_source", "email_bounced", "email_bounced_at", "email_bounced_reason", "unsubscribe_token"],
  hoa_emails: ["id", "email_class", "total_recipients", "total_sent", "total_failed", "total_suppressed", "total_unknown", "send_run_key", "send_started_at", "send_finished_at", "send_errors", "send_last_error"],
  hoa_email_recipients: ["id", "kind", "run_key", "position", "dedupe_key", "claim", "claimed_at", "member_fields", "copies", "suppressed_reason", "delivery_status"],
  hoa_email_send_leases: ["id", "email", "token", "purpose", "worker", "started_at"],
};

/**
 * Directus as the routes see it: email rows live in the MemoryStore (the queue
 * mutates them through the store), members and orgs in plain fixtures. Every
 * request is logged in `ops`.
 */
export function fakeDirectus(store: MemoryStore, fx: {
  org: Record<string, any>;
  members: Array<Record<string, any>>;
  board?: string[];
  provisioned?: { queue: boolean; compliance: boolean };
}) {
  const ops: any[] = [];
  let seq = 0;
  const prov = () => fx.provisioned ?? { queue: true, compliance: true };
  const directus = {
    ops,
    async request(op: any) {
      ops.push(op);
      const c = op.collection;
      if (op.op === "readFields") {
        if (c === "hoa_members") return (prov().compliance ? QUEUE_FIELDS_PROVISIONED.hoa_members! : ["id", "email"]).map((field) => ({ field }));
        if (!prov().queue) return (c === "hoa_emails" && prov().compliance ? ["id", "email_class"] : ["id"]).map((field) => ({ field }));
        return (QUEUE_FIELDS_PROVISIONED[c] ?? ["id"]).map((field) => ({ field }));
      }
      if (op.op === "readItem" && c === "hoa_organizations") return fx.org;
      if (op.op === "readItem" && c === "hoa_emails") {
        const e = store.emails.get(op.id);
        return e ? { attachments: [], ...e } : null;
      }
      if (op.op === "readItems" && c === "hoa_members") {
        const f = op.query?.filter ?? {};
        let rows = fx.members;
        if (f.id?._in) rows = rows.filter((m) => f.id._in.includes(m.id));
        if (f.email_bounced?._eq === true) rows = rows.filter((m) => m.email_bounced === true);
        if (f.email?._nnull) rows = rows.filter((m) => !!m.email);
        return rows.map((m) => ({ ...m }));
      }
      if (op.op === "readItems" && c === "hoa_board_members") {
        return (fx.board ?? []).map((email) => ({ title: "Board", hoa_member: { first_name: "B", last_name: "M", email } }));
      }
      if (op.op === "readItems" && c === "hoa_emails") {
        const f = op.query?.filter ?? {};
        if (f.status?._eq === "scheduled") {
          return [...store.emails.values()]
            .filter((e) => e.status === "scheduled" && String(e.scheduled_at) <= f.scheduled_at._lte)
            .map((e) => ({ id: e.id }));
        }
        return [];
      }
      if (op.op === "readItems" && (c === "hoa_vendors" || c === "directus_files")) return [];
      if (op.op === "readFiles") return [];
      if (op.op === "createItem" && c === "hoa_emails") {
        const id = `email-new-${++seq}`;
        store.addEmail({ id, ...op.data });
        return { id, ...op.data };
      }
      if (op.op === "updateItem" && c === "hoa_emails") {
        Object.assign(store.emails.get(op.id)!, op.data);
        return { id: op.id };
      }
      if (op.op === "updateItemsBatch" && c === "hoa_members") {
        for (const p of op.data) Object.assign(fx.members.find((m) => m.id === p.id)!, p);
        return op.data;
      }
      if (op.op === "createItem") return { id: `${c}-${++seq}`, ...op.data };
      if (op.op === "readItems") return [];
      return {};
    },
  };
  return directus;
}

/** The @directus/sdk builders as plain descriptors (vi.mock factory body). */
export const sdkDescriptors = {
  readItems: (collection: string, query: any) => ({ op: "readItems", collection, query }),
  readItem: (collection: string, id: string, query: any) => ({ op: "readItem", collection, id, query }),
  createItem: (collection: string, data: any, query?: any) => ({ op: "createItem", collection, data, query }),
  createItems: (collection: string, data: any[], query?: any) => ({ op: "createItems", collection, data, query }),
  updateItem: (collection: string, id: string, data: any, query?: any) => ({ op: "updateItem", collection, id, data, query }),
  updateItems: (collection: string, keysOrQuery: any, data: any, query?: any) => ({ op: "updateItems", collection, keysOrQuery, data, query }),
  updateItemsBatch: (collection: string, data: any[]) => ({ op: "updateItemsBatch", collection, data }),
  deleteItems: (collection: string, keysOrQuery: any) => ({ op: "deleteItems", collection, keysOrQuery }),
  deleteItem: (collection: string, id: string) => ({ op: "deleteItem", collection, id }),
  aggregate: (collection: string, options: any) => ({ op: "aggregate", collection, options }),
  readFieldsByCollection: (collection: string) => ({ op: "readFields", collection }),
  readFiles: (query: any) => ({ op: "readFiles", collection: "directus_files", query }),
  readFile: (id: string, query: any) => ({ op: "readFile", collection: "directus_files", id, query }),
  uploadFiles: (data: FormData, query?: any) => ({ op: "uploadFiles", collection: "directus_files", data, query }),
  updateFiles: (keys: string[], data: any) => ({ op: "updateFiles", collection: "directus_files", keys, data }),
  readFolders: (query: any) => ({ op: "readFolders", collection: "directus_folders", query }),
  readAssetArrayBuffer: (id: string) => ({ op: "readAsset", collection: "directus_files", id }),
  readUsers: (query: any) => ({ op: "readUsers", collection: "directus_users", query }),
};

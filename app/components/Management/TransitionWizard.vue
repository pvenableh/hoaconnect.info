<script setup lang="ts">
/**
 * The management-transition wizard: "swap managers in an afternoon" (VISION
 * Pillar A), as a screen.
 *
 * Everything shown here is computed by the server. The component holds three
 * choices — who is leaving, who takes over, whether the outgoing manager gets a
 * copy of their own work — and re-asks `/api/org/transition/preview` whenever
 * one of them changes. It never decides what a choice means; the planner does,
 * because the same function has to validate the answer at execute time and two
 * implementations of "who is eligible" is exactly how a UI ends up offering a
 * successor the server then refuses.
 *
 * The result screen is not a toast. A transition writes to several collections
 * with no transaction across them, so "it worked" and "it stopped at step four"
 * are both real outcomes an admin has to be able to read — including which
 * writes landed. The partial-failure path renders the same step list as the
 * success path, from the error payload.
 */
import { toast } from "vue-sonner";
import { describeGrace } from "#core/shared/transition/grace";

const props = defineProps<{ orgId: string; orgName?: string }>();
const emit = defineEmits<{ (e: "completed"): void }>();

type Issue = { code: string; message: string };
type Step = { kind: string; label: string; detail: string; targetIds: string[] };
type Successor = {
  id: string;
  name: string;
  email: string | null;
  isBoardMember: boolean;
  boardTitle: string | null;
};
type Offboardable = {
  id: string;
  name: string;
  email: string | null;
  roleKind: string;
  isAgencyStaff: boolean;
  hasGrants: boolean;
};
interface PreviewResponse {
  plan: {
    blockers: Issue[];
    warnings: Issue[];
    steps: Step[];
    successor: { id: string; name: string } | null;
    outgoing: { id: string; name: string }[];
    graceEndsAt: string | null;
    canExecute: boolean;
  };
  successors: Successor[];
  offboardable: Offboardable[];
  pendingAdminInvites: { email: string; expiresAt: string | null }[];
  organization: { id: string; name: string; slug: string; graceEndsAt: string | null };
}
type StepResult = { kind: string; label: string; status: "done" | "skipped" | "failed"; note?: string };
interface ExecuteResponse {
  completed: boolean;
  steps: StepResult[];
  auditEntryId: string | null;
  exportId: string | null;
  graceEndsAt: string | null;
}

const STAGES = ["who", "successor", "review", "done"] as const;
type Stage = (typeof STAGES)[number];

const stage = ref<Stage>("who");
const started = ref(false);

// `null` means "server, you decide" — which is NOT the same as an empty array,
// and the planner treats them differently on purpose. It stays null until the
// admin actually touches a checkbox.
const outgoingIds = ref<string[] | null>(null);
const successorId = ref<string | null>(null);
const includeExport = ref(false);

const preview = ref<PreviewResponse | null>(null);
const previewing = ref(false);
const previewError = ref<string | null>(null);

const executing = ref(false);
const result = ref<ExecuteResponse | null>(null);
const executeError = ref<string | null>(null);

const plan = computed(() => preview.value?.plan ?? null);
const selectedOutgoing = computed(
  () => outgoingIds.value ?? (plan.value?.outgoing ?? []).map((m) => m.id)
);
const isLeaving = (id: string) => selectedOutgoing.value.includes(id);

/** A blocker the successor picker can clear, versus one that needs other work. */
const needsSuccessor = computed(() =>
  (plan.value?.blockers ?? []).some(
    (b) => b.code === "successor_required" || b.code === "no_eligible_successor"
  )
);
const noEligibleSuccessor = computed(() =>
  (plan.value?.blockers ?? []).some((b) => b.code === "no_eligible_successor")
);

const grace = computed(() => describeGrace(plan.value?.graceEndsAt ?? null));
const resultGrace = computed(() => describeGrace(result.value?.graceEndsAt ?? null));

const STEP_ICONS: Record<string, string> = {
  promote_admin: "lucide:user-check",
  revoke_grants: "lucide:key-round",
  deactivate_member: "lucide:user-minus",
  end_vendor: "lucide:calendar-x",
  detach_billing: "lucide:unlink",
  open_grace: "lucide:life-buoy",
  offer_export: "lucide:package",
  write_audit: "lucide:scroll-text",
};
const stepIcon = (kind: string) => STEP_ICONS[kind] || "lucide:check";

async function runPreview() {
  if (!props.orgId) return;
  previewing.value = true;
  previewError.value = null;
  try {
    preview.value = await $fetch<PreviewResponse>("/api/org/transition/preview", {
      method: "POST",
      body: {
        orgId: props.orgId,
        successorMemberId: successorId.value,
        outgoingMemberIds: outgoingIds.value,
        includeExportForOutgoing: includeExport.value,
      },
    });
  } catch (e: any) {
    previewError.value = e?.data?.statusMessage || e?.data?.message || e?.message || "Could not plan the transition.";
  } finally {
    previewing.value = false;
  }
}

function start() {
  started.value = true;
  stage.value = "who";
  runPreview();
}

function toggleOutgoing(id: string) {
  const current = [...selectedOutgoing.value];
  const at = current.indexOf(id);
  if (at >= 0) current.splice(at, 1);
  else current.push(id);
  // From here on the choice is explicit, including "nobody" — the planner reads
  // an empty array as a billing-only change rather than falling back to the
  // default set.
  outgoingIds.value = current;
  runPreview();
}

function chooseSuccessor(id: string) {
  successorId.value = successorId.value === id ? null : id;
  runPreview();
}

watch(includeExport, runPreview);

const stageIndex = computed(() => STAGES.indexOf(stage.value));
const goTo = (s: Stage) => {
  stage.value = s;
};

async function execute() {
  if (!plan.value?.canExecute) return;
  executing.value = true;
  executeError.value = null;
  try {
    result.value = await $fetch<ExecuteResponse>("/api/org/transition/execute", {
      method: "POST",
      body: {
        orgId: props.orgId,
        successorMemberId: successorId.value,
        outgoingMemberIds: outgoingIds.value,
        includeExportForOutgoing: includeExport.value,
      },
    });
    stage.value = "done";
    emit("completed");
    toast.success("Transition complete");
  } catch (e: any) {
    // A stopped transition still wrote things. The response carries the step
    // list; showing it is the difference between an admin who knows the manager
    // was offboarded and one who has to guess.
    const data = e?.data?.data as ExecuteResponse | undefined;
    executeError.value =
      e?.data?.statusMessage || e?.data?.message || e?.message || "The transition could not be completed.";
    if (data?.steps) {
      result.value = data;
      stage.value = "done";
      emit("completed");
    }
  } finally {
    executing.value = false;
  }
}

function restart() {
  started.value = false;
  stage.value = "who";
  outgoingIds.value = null;
  successorId.value = null;
  includeExport.value = false;
  result.value = null;
  executeError.value = null;
  preview.value = null;
}

const displayName = (m: { name: string; email: string | null }) => m.name || m.email || "This member";
const titleCase = (s: string | null) =>
  s ? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null;
</script>

<template>
  <div class="space-y-6">
    <!-- ───────── Intro ───────── -->
    <Card v-if="!started">
      <CardHeader>
        <CardTitle>Change management company</CardTitle>
        <CardDescription>
          Hand the community back to its board, or over to a new manager — in the right order, with
          a record of what happened.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <p class="text-sm t-text-secondary">
          Nothing is written until you have seen the whole plan and confirmed it. The community's
          administrator is promoted <strong>before</strong> anyone loses access, so there is never a
          moment where nobody can run the account — and if the community is billed through the
          management company, it keeps working for 60 days rather than being switched off.
        </p>
        <div class="rounded-xl border t-border p-4 text-sm t-text-secondary">
          <p class="font-medium t-text mb-1">Nothing is deleted.</p>
          The outgoing manager's membership is deactivated and the management company is end-dated
          in your vendor list. Everything they did stays in the community's record — that is what
          makes the history yours.
        </div>
        <Button class="rounded-full" @click="start">
          <Icon name="lucide:arrow-right-left" class="h-4 w-4 mr-1.5" />
          Plan a transition
        </Button>
      </CardContent>
    </Card>

    <template v-else>
      <!-- ───────── Progress ───────── -->
      <div class="flex items-center gap-2 text-xs">
        <template v-for="(s, i) in STAGES" :key="s">
          <span
            :class="[
              'px-2.5 py-1 rounded-full capitalize',
              i === stageIndex ? 'bg-blue-600 text-white' : i < stageIndex ? 'bg-blue-100 text-blue-700' : 't-bg-subtle t-text-muted',
            ]"
          >
            {{ s === "who" ? "Who's leaving" : s === "successor" ? "Who takes over" : s === "review" ? "Review" : "Done" }}
          </span>
          <Icon v-if="i < STAGES.length - 1" name="lucide:chevron-right" class="h-3 w-3 t-text-muted" />
        </template>
      </div>

      <div v-if="previewError" class="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {{ previewError }}
      </div>

      <!-- ───────── 1. Who is leaving ───────── -->
      <Card v-if="stage === 'who'">
        <CardHeader>
          <CardTitle>Who is leaving?</CardTitle>
          <CardDescription>
            Everyone from the management company is selected by default — including anyone of theirs
            holding an administrator seat on this community.
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div v-if="previewing && !preview" class="py-8 text-center t-text-muted">Reading the community…</div>

          <div v-else-if="!preview?.offboardable.length" class="rounded-xl border t-border p-4 text-sm t-text-secondary">
            No property managers or management-company staff currently have access to this community.
            You can still continue if you only need to change how the community is billed.
          </div>

          <div v-else class="divide-y">
            <label
              v-for="m in preview.offboardable"
              :key="m.id"
              class="flex items-start gap-3 py-3 cursor-pointer"
            >
              <Checkbox :model-value="isLeaving(m.id)" class="mt-1" @update:model-value="toggleOutgoing(m.id)" />
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-medium t-text">{{ displayName(m) }}</span>
                  <span v-if="m.isAgencyStaff" class="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    Management company
                  </span>
                  <span v-if="m.roleKind === 'hoa_admin'" class="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                    Administrator
                  </span>
                </div>
                <p class="text-sm t-text-muted truncate">{{ m.email }}</p>
                <p v-if="m.isAgencyStaff && m.roleKind === 'hoa_admin'" class="text-xs t-text-muted mt-1">
                  This seat belongs to the management company, not the community. Leaving it in place
                  means they keep control of the account after they stop managing the property.
                </p>
              </div>
            </label>
          </div>

          <div
            v-if="preview && selectedOutgoing.length === 0"
            class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
          >
            Nobody is being offboarded. This will change how the community is billed and nothing
            else — the manager keeps their access.
          </div>

          <div class="flex justify-end">
            <Button class="rounded-full" :disabled="previewing" @click="goTo('successor')">
              Continue<Icon name="lucide:arrow-right" class="h-4 w-4 ml-1.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- ───────── 2. Who takes over ───────── -->
      <Card v-if="stage === 'successor'">
        <CardHeader>
          <CardTitle>Who takes over the account?</CardTitle>
          <CardDescription>
            Board members first, most senior at the top. Whoever you pick becomes an administrator
            before anything else happens.
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div
            v-if="noEligibleSuccessor"
            class="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 space-y-2"
          >
            <p class="font-medium">There is nobody here who can take over.</p>
            <p>
              Every active member of this community either works for the management company or is a
              property manager. Invite a board member and have them create their account, then come
              back — the transition cannot safely run until someone from the community can hold the
              account.
            </p>
            <div v-if="preview?.pendingAdminInvites.length" class="pt-1">
              <p class="font-medium">Already invited, waiting to be accepted:</p>
              <ul class="list-disc pl-5">
                <li v-for="inv in preview.pendingAdminInvites" :key="inv.email">
                  {{ inv.email }}<span v-if="inv.expiresAt"> — expires {{ new Date(inv.expiresAt).toLocaleDateString() }}</span>
                </li>
              </ul>
            </div>
          </div>

          <div v-else-if="!needsSuccessor && !successorId" class="rounded-xl border t-border p-4 text-sm t-text-secondary">
            This community already has an administrator who isn't leaving, so you don't have to
            promote anyone. You still can — pick someone below.
          </div>

          <div v-if="preview?.successors.length" class="divide-y">
            <button
              v-for="s in preview.successors"
              :key="s.id"
              type="button"
              class="w-full flex items-center gap-3 py-3 text-left"
              @click="chooseSuccessor(s.id)"
            >
              <span
                :class="[
                  'h-4 w-4 rounded-full border-2 shrink-0 grid place-items-center',
                  successorId === s.id ? 'border-blue-600' : 't-border',
                ]"
              >
                <span v-if="successorId === s.id" class="h-2 w-2 rounded-full bg-blue-600" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-2 flex-wrap">
                  <span class="font-medium t-text">{{ displayName(s) }}</span>
                  <span v-if="s.boardTitle" class="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                    {{ titleCase(s.boardTitle) }}
                  </span>
                  <span v-else-if="s.isBoardMember" class="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Board</span>
                </span>
                <span class="block text-sm t-text-muted truncate">{{ s.email }}</span>
              </span>
            </button>
          </div>

          <div class="flex justify-between">
            <Button variant="ghost" class="rounded-full" @click="goTo('who')">
              <Icon name="lucide:arrow-left" class="h-4 w-4 mr-1.5" />Back
            </Button>
            <Button class="rounded-full" :disabled="previewing" @click="goTo('review')">
              Review the plan<Icon name="lucide:arrow-right" class="h-4 w-4 ml-1.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- ───────── 3. Review ───────── -->
      <Card v-if="stage === 'review'">
        <CardHeader>
          <CardTitle>What will happen</CardTitle>
          <CardDescription>In this order. Nothing has been written yet.</CardDescription>
        </CardHeader>
        <CardContent class="space-y-5">
          <div v-if="previewing" class="py-6 text-center t-text-muted">Re-planning…</div>

          <template v-else-if="plan">
            <!-- Blockers -->
            <div
              v-for="b in plan.blockers"
              :key="b.code"
              class="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex gap-3"
            >
              <Icon name="lucide:octagon-alert" class="h-5 w-5 shrink-0" />
              <div>
                <p class="font-medium">This can't run yet</p>
                <p>{{ b.message }}</p>
                <button
                  v-if="b.code === 'successor_required'"
                  type="button"
                  class="mt-1 font-medium underline"
                  @click="goTo('successor')"
                >
                  Choose who takes over
                </button>
              </div>
            </div>

            <!-- Warnings -->
            <div
              v-for="w in plan.warnings"
              :key="w.code"
              class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex gap-3"
            >
              <Icon name="lucide:info" class="h-5 w-5 shrink-0" />
              <p>{{ w.message }}</p>
            </div>

            <!-- The plan -->
            <ol v-if="plan.steps.length" class="space-y-3">
              <li v-for="(s, i) in plan.steps" :key="s.kind" class="flex gap-3">
                <span class="h-8 w-8 shrink-0 rounded-full t-bg-subtle grid place-items-center text-sm font-medium t-text-secondary">
                  {{ i + 1 }}
                </span>
                <div class="min-w-0">
                  <p class="font-medium t-text flex items-center gap-2">
                    <Icon :name="stepIcon(s.kind)" class="h-4 w-4 t-text-muted" />
                    {{ s.label }}
                  </p>
                  <p class="text-sm t-text-muted">{{ s.detail }}</p>
                </div>
              </li>
            </ol>

            <div v-if="grace" class="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              <p class="font-medium">{{ orgName || "This community" }} keeps working until {{ grace.endsOn }}.</p>
              <p>{{ grace.detail }}</p>
            </div>

            <!-- The export offer -->
            <label class="flex items-start gap-3 rounded-xl border t-border p-4 cursor-pointer">
              <Checkbox v-model="includeExport" class="mt-0.5" />
              <span class="text-sm">
                <span class="font-medium t-text block">Prepare a copy for the outgoing manager</span>
                <span class="t-text-muted">
                  The operational record without your board's private discussion. Their work should
                  leave with them; your community's history stays here either way.
                </span>
              </span>
            </label>

            <div class="flex justify-between items-center pt-2">
              <Button variant="ghost" class="rounded-full" @click="goTo('successor')">
                <Icon name="lucide:arrow-left" class="h-4 w-4 mr-1.5" />Back
              </Button>
              <Button
                class="rounded-full"
                :disabled="!plan.canExecute || executing"
                @click="execute"
              >
                <Icon v-if="executing" name="lucide:loader-circle" class="h-4 w-4 mr-1.5 animate-spin" />
                {{ executing ? "Running…" : "Run the transition" }}
              </Button>
            </div>

            <div v-if="executeError && !result" class="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              {{ executeError }}
            </div>
          </template>
        </CardContent>
      </Card>

      <!-- ───────── 4. What actually ran ───────── -->
      <Card v-if="stage === 'done' && result">
        <CardHeader>
          <CardTitle class="flex items-center gap-2">
            <Icon
              :name="result.completed ? 'lucide:circle-check' : 'lucide:circle-alert'"
              :class="['h-5 w-5', result.completed ? 'text-green-600' : 'text-amber-600']"
            />
            {{ result.completed ? "Transition complete" : "The transition stopped part-way" }}
          </CardTitle>
          <CardDescription v-if="!result.completed">
            Everything listed as done was applied and is a safe state. Nothing after the failure ran.
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-5">
          <div v-if="executeError && !result.completed" class="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {{ executeError }}
          </div>

          <ul class="space-y-3">
            <li v-for="(s, i) in result.steps" :key="`${s.kind}-${i}`" class="flex gap-3">
              <Icon
                :name="s.status === 'done' ? 'lucide:circle-check' : s.status === 'skipped' ? 'lucide:circle-minus' : 'lucide:circle-x'"
                :class="[
                  'h-5 w-5 shrink-0 mt-0.5',
                  s.status === 'done' ? 'text-green-600' : s.status === 'skipped' ? 't-text-muted' : 'text-rose-600',
                ]"
              />
              <div class="min-w-0">
                <p class="font-medium t-text">{{ s.label }}</p>
                <p v-if="s.note" class="text-sm t-text-muted">{{ s.note }}</p>
              </div>
            </li>
          </ul>

          <div v-if="resultGrace?.active" class="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <p class="font-medium">{{ resultGrace.headline }}</p>
            <p>{{ resultGrace.detail }}</p>
          </div>

          <div class="rounded-xl border t-border p-4 text-sm t-text-secondary space-y-1">
            <p v-if="result.auditEntryId">
              <Icon name="lucide:scroll-text" class="h-4 w-4 inline mr-1 t-text-muted" />
              Recorded in this community's audit log. That entry can't be edited or deleted.
            </p>
            <p v-if="result.exportId">
              <Icon name="lucide:package" class="h-4 w-4 inline mr-1 t-text-muted" />
              An export is being prepared for the outgoing manager — it will appear under
              Settings → Your data.
            </p>
          </div>

          <div class="flex justify-end">
            <Button variant="outline" class="rounded-full" @click="restart">Done</Button>
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>

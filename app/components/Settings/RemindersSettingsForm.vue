<template>
  <div class="space-y-6" data-testid="reminders-settings">
    <Card>
      <CardHeader>
        <CardTitle>When reminders go out</CardTitle>
        <CardDescription>
          Reminders reach residents in your community's name, so every one is off until you turn it on. Turning one on approves
          its wording; each send after that is not a new approval.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1.5">
            <Label for="reminderSendHour">Send day-based reminders at</Label>
            <select id="reminderSendHour" v-model.number="form.send_hour" class="w-full px-3 py-2 border rounded-md bg-background text-sm">
              <option v-for="h in HOURS" :key="h" :value="h">{{ hourLabel(h) }}</option>
            </select>
            <p class="text-xs text-muted-foreground">Nothing goes out before this hour or after 9 pm, your community's time.</p>
          </div>
          <div class="space-y-1.5">
            <Label for="reminderTimezone">Community time zone</Label>
            <select id="reminderTimezone" v-model="form.timezone" class="w-full px-3 py-2 border rounded-md bg-background text-sm">
              <option v-for="z in zones" :key="z.value" :value="z.value">{{ z.label }}</option>
            </select>
            <p class="text-xs text-muted-foreground">"Due tomorrow" means your tomorrow. The notification digest uses it too.</p>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card v-for="rule in REMINDER_RULES" :key="rule" :data-testid="`reminder-rule-${rule}`">
      <CardHeader>
        <div class="flex items-start justify-between gap-4">
          <div class="space-y-1">
            <CardTitle>{{ RULE_LABELS[rule] }}</CardTitle>
            <CardDescription>{{ RULE_GUIDE[rule].summary }}</CardDescription>
          </div>
          <Switch
            v-model="form.rules[rule].enabled"
            :disabled="saving"
            :aria-label="`${RULE_LABELS[rule]} reminders`"
            :data-testid="`reminder-toggle-${rule}`"
          />
        </div>
        <p v-if="approvalNote(rule)" class="text-xs text-muted-foreground">{{ approvalNote(rule) }}</p>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2">
          <p class="text-sm font-medium">Send</p>
          <label
            v-for="(label, stage) in RULE_GUIDE[rule].stages"
            :key="stage"
            class="flex items-center gap-2 text-sm"
          >
            <Checkbox v-model="form.rules[rule].stages[stage]" :disabled="saving" />
            {{ label }}
          </label>
        </div>

        <div v-if="RULE_GUIDE[rule].daysLabel" class="space-y-1.5 max-w-xs">
          <Label :for="`reminderDays-${rule}`">{{ RULE_GUIDE[rule].daysLabel }}</Label>
          <Input :id="`reminderDays-${rule}`" v-model="form.rules[rule].days" type="number" min="1" max="60" inputmode="numeric" />
        </div>

        <label v-if="rule === 'dues'" class="flex items-center gap-2 text-sm">
          <Checkbox v-model="form.rules.dues.tenants" :disabled="saving" />
          Include tenants (the billed member and owners are always included)
        </label>

        <details class="group rounded-md border px-3 py-2">
          <summary class="cursor-pointer text-sm font-medium">Use your own wording</summary>
          <div class="space-y-3 pt-3">
            <div class="space-y-1.5">
              <Label :for="`reminderSubject-${rule}`">Subject</Label>
              <Input :id="`reminderSubject-${rule}`" v-model="form.rules[rule].subject" maxlength="300" placeholder="Leave empty for the standard subject" />
            </div>
            <div class="space-y-1.5">
              <Label :for="`reminderIntro-${rule}`">First sentence</Label>
              <Input :id="`reminderIntro-${rule}`" v-model="form.rules[rule].intro" maxlength="300" placeholder="Leave empty for the standard sentence" />
            </div>
            <p class="text-xs text-muted-foreground">
              Fill in details with
              <code v-for="t in RULE_GUIDE[rule].tokens" :key="t" class="mx-0.5 rounded bg-muted px-1">{{ tokenText(t) }}</code>.
              Changing the wording of a rule that is on asks for your approval again when you save.
            </p>
          </div>
        </details>
      </CardContent>
    </Card>

    <div class="flex items-center justify-end gap-3" data-testid="reminders-save-bar">
      <p v-if="hasChanges" class="text-sm text-muted-foreground">Unsaved changes</p>
      <Button :disabled="saving || !hasChanges" data-testid="reminders-save" @click="save">
        <Icon v-if="saving" name="lucide:loader-2" class="mr-2 h-4 w-4 animate-spin" />
        {{ saving ? "Saving…" : "Save reminders" }}
      </Button>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>See it, and try it</CardTitle>
        <CardDescription>
          Preview each email in your branding, send one to yourself, or see what the saved settings would send in the next 24 hours.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <Label for="reminderPreviewTemplate">Email</Label>
              <select id="reminderPreviewTemplate" v-model="previewTemplate" class="px-3 py-1.5 border rounded-md bg-background text-sm">
                <option v-for="t in TEMPLATES" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
            </div>
            <Button variant="outline" :disabled="sendingTest" data-testid="reminders-send-test" @click="sendTest">
              <Icon v-if="sendingTest" name="lucide:loader-2" class="mr-2 h-4 w-4 animate-spin" />
              <Icon v-else name="lucide:send" class="mr-2 h-4 w-4" />
              Send me a test
            </Button>
          </div>
          <div class="relative rounded-lg border overflow-hidden bg-white">
            <iframe
              :src="previewSrc"
              sandbox=""
              title="Reminder email preview"
              data-testid="reminders-email-preview"
              class="w-full h-[520px] bg-white"
            />
          </div>
        </div>

        <div class="space-y-3 border-t pt-4" data-testid="reminders-dry-run">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium">What goes out in the next 24 hours</p>
              <p class="text-xs text-muted-foreground">
                Uses the saved settings<span v-if="hasChanges"> — save your changes first</span>. Nothing is sent.
              </p>
            </div>
            <Button variant="outline" :disabled="dryRunning" data-testid="reminders-dry-run-button" @click="runDry">
              <Icon v-if="dryRunning" name="lucide:loader-2" class="mr-2 h-4 w-4 animate-spin" />
              <Icon v-else name="lucide:calendar-clock" class="mr-2 h-4 w-4" />
              Check the next 24 hours
            </Button>
          </div>

          <div v-if="dry" class="space-y-2" aria-live="polite">
            <p class="text-base font-medium" data-testid="reminders-dry-headline">{{ dry.headline }}</p>
            <ul v-if="dry.notifications.length" class="divide-y rounded-md border text-sm">
              <li v-for="(n, i) in dry.notifications" :key="i" class="flex items-center justify-between gap-3 px-3 py-2">
                <span class="truncate">{{ n.subject }}</span>
                <span class="shrink-0 text-xs text-muted-foreground">{{ n.recipients }} {{ n.recipients === 1 ? "person" : "people" }}</span>
              </li>
            </ul>
            <p v-if="dry.total > dry.notifications.length" class="text-xs text-muted-foreground">
              …and {{ dry.total - dry.notifications.length }} more.
            </p>
            <p v-for="u in dry.unreachable" :key="`u-${u.rule}`" class="text-sm text-muted-foreground">
              <span class="font-medium">{{ u.label }}:</span> {{ u.text }}
            </p>
            <p v-for="o in dry.off" :key="`o-${o.rule}`" class="text-sm text-muted-foreground">
              <span class="font-medium">{{ o.label }} (off):</span> {{ o.text }}
            </p>
            <p class="text-xs text-muted-foreground">Checked at {{ dry.localTime }} {{ zoneName }}.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import type { HoaOrganization, BlockSetting } from "#core/types/directus";
import { toast } from "vue-sonner";
import { RULE_GUIDE, RULES_WITH_DAYS, type DryRunSummary } from "#core/shared/reminders/admin";
import {
  DEFAULT_SEND_HOUR,
  REMINDER_RULES,
  RULE_LABELS,
  RULE_STAGES,
  SEND_HOUR_MAX,
  SEND_HOUR_MIN,
  resolveReminderSettings,
  obj,
  type ReminderRule,
} from "#core/shared/reminders/settings";
import { DEFAULT_ORG_TIMEZONE, US_TIME_ZONES, orgTimeZone } from "#core/shared/org-timezone";

const props = defineProps<{
  organization: HoaOrganization;
  settings: BlockSetting | null;
}>();

const emit = defineEmits<{
  updated: [payload: { reminders: Record<string, any>; timezone: string }];
}>();

const HOURS = Array.from({ length: SEND_HOUR_MAX - SEND_HOUR_MIN + 1 }, (_, i) => SEND_HOUR_MIN + i);
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "am" : "pm"}`;
const tokenText = (t: string) => `{{${t}}}`;

const TEMPLATES = [
  { value: "reminder-dues", label: "Dues" },
  { value: "reminder-meeting", label: "Meeting" },
  { value: "reminder-violation", label: "Violation" },
  { value: "reminder-poll", label: "Poll" },
] as const;

// ── The form, built from the saved settings ─────────────────────────────────

interface RuleForm {
  enabled: boolean;
  stages: Record<string, boolean>;
  days: number | string;
  tenants: boolean;
  subject: string;
  intro: string;
}
interface Form {
  send_hour: number;
  timezone: string;
  rules: Record<ReminderRule, RuleForm>;
}

const savedTimezone = () => orgTimeZone(props.organization as { timezone?: string | null });

function fromSaved(): Form {
  const r = resolveReminderSettings(props.settings?.reminders);
  return {
    send_hour: r.sendHour,
    timezone: savedTimezone(),
    rules: Object.fromEntries(
      REMINDER_RULES.map((rule) => [
        rule,
        {
          enabled: r.rules[rule].enabled,
          stages: { ...r.rules[rule].stages },
          days: r.rules[rule].days,
          tenants: r.rules[rule].tenants,
          subject: r.rules[rule].copy?.subject ?? "",
          intro: r.rules[rule].copy?.intro ?? "",
        },
      ])
    ) as Record<ReminderRule, RuleForm>,
  };
}

const form = ref<Form>(fromSaved());
const baseline = ref(JSON.stringify(form.value));
const hasChanges = computed(() => JSON.stringify(form.value) !== baseline.value);

function reset() {
  form.value = fromSaved();
  baseline.value = JSON.stringify(form.value);
}
// By value, not identity: the page re-reads the organization (and hands down a new object
// for the same settings) more than once while it loads, and that must not wipe an edit.
watch(() => JSON.stringify([props.settings?.reminders ?? null, (props.organization as any)?.timezone ?? null]), reset);

/** The saved zone, plus whatever the community already has if it isn't one of ours. */
const zones = computed(() => {
  const list: Array<{ value: string; label: string }> = US_TIME_ZONES.map((z) => ({ ...z }));
  const cur = savedTimezone();
  return list.some((z) => z.value === cur) ? list : [{ value: cur, label: cur }, ...list];
});
const zoneName = computed(() => zones.value.find((z) => z.value === form.value.timezone)?.label ?? form.value.timezone);

function approvalNote(rule: ReminderRule): string {
  const saved = obj(obj(props.settings?.reminders)?.rules)?.[rule];
  const at = typeof saved?.approved_at === "string" ? new Date(saved.approved_at) : null;
  if (!saved?.enabled || !at || Number.isNaN(at.getTime())) return "";
  return `Approved ${at.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.`;
}

// ── Save ────────────────────────────────────────────────────────────────────

const saving = ref(false);

const patch = () => ({
  orgId: props.organization.id,
  send_hour: Number(form.value.send_hour) || DEFAULT_SEND_HOUR,
  timezone: form.value.timezone || DEFAULT_ORG_TIMEZONE,
  rules: Object.fromEntries(
    REMINDER_RULES.map((rule) => {
      const f = form.value.rules[rule];
      return [
        rule,
        {
          enabled: f.enabled,
          stages: Object.fromEntries(RULE_STAGES[rule].map((s) => [s, f.stages[s] !== false])),
          ...(RULES_WITH_DAYS.includes(rule) ? { days: Number(f.days) } : {}),
          ...(rule === "dues" ? { tenants: f.tenants } : {}),
          copy: { subject: f.subject, intro: f.intro },
        },
      ];
    })
  ),
});

async function save() {
  saving.value = true;
  try {
    const res = await $fetch<{ reminders: Record<string, any>; timezone: string }>("/api/org/reminders/settings", {
      method: "PUT",
      body: patch(),
    });
    emit("updated", { reminders: res.reminders, timezone: res.timezone });
    reset();
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.statusMessage || "Couldn't save reminders");
  } finally {
    saving.value = false;
  }
}

// ── Preview, test, dry run ──────────────────────────────────────────────────

const previewTemplate = ref<(typeof TEMPLATES)[number]["value"]>("reminder-dues");
const previewSrc = computed(
  () => `/api/email/preview-mjml?${new URLSearchParams({ org: props.organization.id, template: previewTemplate.value, format: "html" })}`
);

const sendingTest = ref(false);
async function sendTest() {
  sendingTest.value = true;
  try {
    const res = await $fetch<{ to: string | null }>("/api/org/reminders/test", {
      method: "POST",
      body: { orgId: props.organization.id, template: previewTemplate.value },
    });
    toast.success(res.to ? `Test sent to ${res.to}` : "Test sent to you");
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.statusMessage || "Couldn't send the test");
  } finally {
    sendingTest.value = false;
  }
}

const dry = ref<(DryRunSummary & { localTime: string | null }) | null>(null);
const dryRunning = ref(false);
async function runDry() {
  dryRunning.value = true;
  try {
    dry.value = await $fetch("/api/org/reminders/dry-run", { method: "POST", body: { orgId: props.organization.id } });
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.statusMessage || "Couldn't check the next 24 hours");
  } finally {
    dryRunning.value = false;
  }
}
</script>

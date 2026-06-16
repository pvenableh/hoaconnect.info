<template>
  <div class="space-y-6">
    <!-- Display name -->
    <Card>
      <CardHeader>
        <CardTitle>Sender name</CardTitle>
        <CardDescription>
          The display name recipients see on your emails. Replies still go to your org's email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="space-y-2 max-w-md">
          <Label for="from_name">Display name</Label>
          <div class="flex gap-2">
            <Input
              id="from_name"
              v-model="fromName"
              :placeholder="orgName || 'Your HOA'"
              :disabled="savingName"
            />
            <Button @click="saveName" :disabled="savingName">
              <Icon v-if="savingName" name="lucide:loader-2" class="mr-2 h-4 w-4 animate-spin" />
              Save
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">
            Defaults to your organization name. Shown as
            <span class="font-medium">{{ fromName || orgName || "Your HOA" }} &lt;{{ effectiveFrom }}&gt;</span>.
          </p>
        </div>
      </CardContent>
    </Card>

    <!-- White-label sending domain -->
    <Card>
      <CardHeader>
        <CardTitle>Sending domain (white-label)</CardTitle>
        <CardDescription>
          Send from your own domain (e.g. <code>board@yourbuilding.com</code>) for full branding and
          best deliverability. Requires adding a few DNS records.
        </CardDescription>
      </CardHeader>
      <CardContent class="space-y-4">
        <!-- No domain yet -->
        <div v-if="!domain" class="space-y-2 max-w-md">
          <Label for="email_domain">Domain</Label>
          <div class="flex gap-2">
            <Input
              id="email_domain"
              v-model="domainInput"
              placeholder="yourbuilding.com"
              :disabled="authenticating"
            />
            <Button @click="authenticate" :disabled="authenticating">
              <Icon v-if="authenticating" name="lucide:loader-2" class="mr-2 h-4 w-4 animate-spin" />
              Authenticate
            </Button>
          </div>
          <p class="text-xs text-muted-foreground">
            We'll generate DNS records for you to add at your domain registrar.
          </p>
        </div>

        <!-- Domain set -->
        <div v-else class="space-y-4">
          <div class="flex items-center gap-2">
            <span class="font-medium">{{ domain }}</span>
            <span
              :class="[
                'text-xs px-2 py-0.5 rounded-full font-semibold',
                verified
                  ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
              ]"
            >
              {{ verified ? "Verified" : "Pending DNS" }}
            </span>
          </div>

          <!-- DNS records -->
          <div v-if="dns.length" class="space-y-2">
            <Label>Add these DNS records</Label>
            <div class="border rounded-lg overflow-x-auto">
              <table class="w-full text-xs">
                <thead class="t-bg-subtle">
                  <tr class="text-left">
                    <th class="p-2 font-medium">Type</th>
                    <th class="p-2 font-medium">Host / Name</th>
                    <th class="p-2 font-medium">Value</th>
                    <th class="p-2 font-medium" v-if="verified">OK</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(r, i) in dns" :key="i" class="border-t align-top">
                    <td class="p-2">{{ r.type }}</td>
                    <td class="p-2 font-mono break-all">{{ r.host }}</td>
                    <td class="p-2 font-mono break-all">{{ r.data }}</td>
                    <td class="p-2" v-if="verified">
                      <Icon
                        :name="r.valid ? 'lucide:check' : 'lucide:clock'"
                        :class="r.valid ? 'text-green-600' : 'text-amber-600'"
                        class="h-4 w-4"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- From-address (verified only) -->
          <div v-if="verified" class="space-y-2 max-w-md">
            <Label for="from_local">From address</Label>
            <div class="flex items-center gap-2">
              <Input id="from_local" v-model="fromLocal" placeholder="board" class="max-w-[180px]" :disabled="savingFrom" />
              <span class="text-sm t-text-muted">@{{ domain }}</span>
              <Button @click="saveFromEmail" :disabled="savingFrom">
                <Icon v-if="savingFrom" name="lucide:loader-2" class="mr-2 h-4 w-4 animate-spin" />
                Save
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">
              Emails will be sent from <span class="font-medium">{{ (fromLocal || "noreply") }}@{{ domain }}</span>.
            </p>
          </div>

          <div class="flex gap-2 pt-2">
            <Button v-if="!verified" variant="outline" @click="verify" :disabled="verifying">
              <Icon v-if="verifying" name="lucide:loader-2" class="mr-2 h-4 w-4 animate-spin" />
              Verify DNS
            </Button>
            <Button variant="ghost" class="text-destructive" @click="disconnect" :disabled="disconnecting">
              <Icon v-if="disconnecting" name="lucide:loader-2" class="mr-2 h-4 w-4 animate-spin" />
              Remove domain
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import type { HoaOrganization } from "~~/types/directus";
import { toast } from "vue-sonner";

const props = defineProps<{ organization: HoaOrganization }>();

const config = useRuntimeConfig();
const orgId = computed(() => props.organization.id);
const orgName = ref<string | null>(props.organization.name || null);

const fromName = ref("");
const fromLocal = ref("");
const domainInput = ref("");
const domain = ref<string | null>(null);
const verified = ref(false);
const dns = ref<Array<{ host: string; type: string; data: string; valid?: boolean }>>([]);

const savingName = ref(false);
const savingFrom = ref(false);
const authenticating = ref(false);
const verifying = ref(false);
const disconnecting = ref(false);

const platformFrom = computed(() => config.public.fromEmail || "noreply@hoaconnect.info");
const effectiveFrom = computed(() => {
  if (verified.value && fromLocal.value && domain.value) return `${fromLocal.value}@${domain.value}`;
  return platformFrom.value;
});

async function loadStatus() {
  if (!orgId.value) return;
  try {
    const s = await $fetch<{
      orgName: string | null;
      fromName: string | null;
      fromEmail: string | null;
      domain: string | null;
      verified: boolean;
      dns: Array<{ host: string; type: string; data: string; valid?: boolean }>;
    }>("/api/email/sender/status", { query: { organizationId: orgId.value } });
    orgName.value = s.orgName || orgName.value;
    fromName.value = s.fromName || "";
    domain.value = s.domain;
    verified.value = s.verified;
    dns.value = s.dns || [];
    fromLocal.value = s.fromEmail ? s.fromEmail.split("@")[0] : "";
  } catch (e: any) {
    console.error("Failed to load sender status:", e);
  }
}

onMounted(loadStatus);

async function saveName() {
  savingName.value = true;
  try {
    await $fetch("/api/email/sender/settings", {
      method: "POST",
      body: { organizationId: orgId.value, fromName: fromName.value },
    });
    toast.success("Display name saved");
  } catch (e: any) {
    toast.error(e.data?.message || "Failed to save display name");
  } finally {
    savingName.value = false;
  }
}

async function authenticate() {
  if (!domainInput.value.trim()) {
    toast.error("Enter a domain");
    return;
  }
  authenticating.value = true;
  try {
    const r = await $fetch<{ domain: string; verified: boolean; dns: any[] }>(
      "/api/email/sender/authenticate",
      { method: "POST", body: { organizationId: orgId.value, domain: domainInput.value } }
    );
    domain.value = r.domain;
    verified.value = r.verified;
    dns.value = r.dns || [];
    toast.success("Domain added — add the DNS records, then verify.");
  } catch (e: any) {
    toast.error(e.data?.message || "Failed to authenticate domain");
  } finally {
    authenticating.value = false;
  }
}

async function verify() {
  verifying.value = true;
  try {
    const r = await $fetch<{ verified: boolean; dns: any[]; message: string }>(
      "/api/email/sender/verify",
      { method: "POST", body: { organizationId: orgId.value } }
    );
    verified.value = r.verified;
    dns.value = r.dns || dns.value;
    r.verified ? toast.success(r.message) : toast.warning(r.message);
  } catch (e: any) {
    toast.error(e.data?.message || "Failed to verify domain");
  } finally {
    verifying.value = false;
  }
}

async function saveFromEmail() {
  savingFrom.value = true;
  try {
    await $fetch("/api/email/sender/settings", {
      method: "POST",
      body: {
        organizationId: orgId.value,
        fromName: fromName.value,
        fromEmail: fromLocal.value.trim() ? `${fromLocal.value.trim()}@${domain.value}` : "",
      },
    });
    toast.success("From address saved");
  } catch (e: any) {
    toast.error(e.data?.message || "Failed to save from address");
  } finally {
    savingFrom.value = false;
  }
}

async function disconnect() {
  disconnecting.value = true;
  try {
    await $fetch("/api/email/sender/disconnect", {
      method: "POST",
      body: { organizationId: orgId.value },
    });
    domain.value = null;
    verified.value = false;
    dns.value = [];
    fromLocal.value = "";
    domainInput.value = "";
    toast.success("Sending domain removed");
  } catch (e: any) {
    toast.error(e.data?.message || "Failed to remove domain");
  } finally {
    disconnecting.value = false;
  }
}
</script>

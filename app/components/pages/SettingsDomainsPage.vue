<script setup lang="ts">
import { toast } from "vue-sonner";

const { navigateToOrg } = useOrgNavigation();
const config = useRuntimeConfig();
const mainDomain = computed(() => (config.public.mainDomain as string) || "hoaconnect.info");

const { selectedOrgId } = await useSelectedOrg();
const orgId = computed(() => selectedOrgId.value);
const orgItems = useDirectusItems("hoa_organizations");

interface DomainState {
  custom_domain?: string | null;
  domain_verified?: boolean | null;
  domain_type?: string | null;
  domain_config?: any;
}

const org = ref<DomainState | null>(null);
const loading = ref(true);

const load = async () => {
  if (!orgId.value) return;
  loading.value = true;
  try {
    org.value = (await orgItems.get(orgId.value, {
      fields: ["custom_domain", "domain_verified", "domain_type", "domain_config"],
    })) as DomainState;
  } catch (e: any) {
    toast.error(e.message || "Failed to load domain settings");
  } finally {
    loading.value = false;
  }
};
watch(orgId, load, { immediate: true });

const domainInput = ref("");
const connecting = ref(false);
const verifying = ref(false);
const disconnecting = ref(false);

const hasDomain = computed(() => !!org.value?.custom_domain);
const isVerified = computed(() => !!org.value?.domain_verified);
const cfg = computed<any>(() => org.value?.domain_config || {});
const domainType = computed(() => org.value?.domain_type || "apex");
const isApex = computed(() => domainType.value === "apex");

const statusLabel = computed(() => {
  if (!hasDomain.value) return "Not connected";
  return isVerified.value ? "Live" : "Pending verification";
});
const statusClass = computed(() => {
  if (!hasDomain.value) return "t-bg-subtle t-text-secondary";
  return isVerified.value ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700";
});

const connect = async () => {
  if (!orgId.value || !domainInput.value.trim()) return;
  connecting.value = true;
  try {
    await $fetch("/api/domains/connect", {
      method: "POST",
      body: { organizationId: orgId.value, domain: domainInput.value.trim() },
    });
    toast.success("Domain connected — add the DNS records, then verify");
    domainInput.value = "";
    await load();
  } catch (e: any) {
    toast.error(e.data?.message || e.message || "Failed to connect domain");
  } finally {
    connecting.value = false;
  }
};

const verify = async () => {
  if (!orgId.value) return;
  verifying.value = true;
  try {
    const res: any = await $fetch("/api/domains/verify", {
      method: "POST",
      body: { organizationId: orgId.value },
    });
    if (res.verified) {
      toast.success("Domain verified — your site is going live");
    } else {
      toast.warning(res.message || "Verification record not found yet");
    }
    await load();
  } catch (e: any) {
    toast.error(e.data?.message || e.message || "Verification failed");
  } finally {
    verifying.value = false;
  }
};

const disconnect = async () => {
  if (!orgId.value) return;
  disconnecting.value = true;
  try {
    await $fetch("/api/domains/disconnect", {
      method: "POST",
      body: { organizationId: orgId.value },
    });
    toast.success("Domain disconnected");
    await load();
  } catch (e: any) {
    toast.error(e.data?.message || e.message || "Failed to disconnect");
  } finally {
    disconnecting.value = false;
  }
};

const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    /* ignore */
  }
};

useSeoMeta({ title: "Custom Domain" });
</script>

<template>
  <div class="min-h-screen t-bg t-text">
    <PageContainer class="space-y-6 max-w-3xl">
      <div>
        <Button variant="ghost" size="sm" class="mb-2 -ml-2" @click="navigateToOrg('/admin/settings/organization')">
          <Icon name="lucide:arrow-left" class="w-4 h-4 mr-1.5" />
          Settings
        </Button>
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-semibold t-text">Custom domain</h1>
          <span class="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full" :class="statusClass">
            {{ statusLabel }}
          </span>
        </div>
        <p class="text-sm t-text-muted mt-0.5">
          Serve your community's public site at your own web address — your content stays the same,
          it just lives at your domain.
        </p>
      </div>

      <div v-if="loading" class="flex justify-center py-16"><div class="spinner-ios" /></div>

      <!-- Connect form -->
      <div v-else-if="!hasDomain" class="ios-card p-6 space-y-4">
        <div class="space-y-1.5">
          <Label for="domain">Your domain</Label>
          <Input id="domain" v-model="domainInput" placeholder="yourbuilding.com" class="font-mono" />
          <p class="text-xs t-text-muted">
            Use your root domain (<span class="font-mono">yourbuilding.com</span>) or a subdomain
            (<span class="font-mono">portal.yourbuilding.com</span>). You'll add a couple of DNS records next.
          </p>
        </div>
        <Button class="rounded-full" :disabled="connecting || !domainInput.trim()" @click="connect">
          <Icon v-if="connecting" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
          <Icon v-else name="lucide:globe" class="w-4 h-4 mr-2" />
          Connect domain
        </Button>
      </div>

      <!-- Connected: instructions + status -->
      <template v-else>
        <div class="ios-card p-6 space-y-2">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2 min-w-0">
              <Icon name="lucide:globe" class="w-5 h-5 t-text-muted shrink-0" />
              <span class="font-mono font-medium truncate">{{ org?.custom_domain }}</span>
              <span class="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full" :class="statusClass">{{ statusLabel }}</span>
            </div>
            <Button variant="ghost" size="sm" :disabled="disconnecting" @click="disconnect">
              <Icon name="lucide:unlink" class="w-4 h-4 mr-1.5" />
              Disconnect
            </Button>
          </div>
          <p v-if="isVerified" class="text-sm text-green-700 flex items-center gap-1.5">
            <Icon name="lucide:check-circle" class="w-4 h-4" />
            Verified — your public site is served at this domain.
          </p>
        </div>

        <!-- DNS instructions (hidden once verified, kept available) -->
        <div class="ios-card p-6 space-y-5">
          <div>
            <h2 class="font-semibold t-text">1. Point your domain to us</h2>
            <p class="text-sm t-text-muted mt-0.5">Add this at your DNS provider (GoDaddy, Cloudflare, Namecheap, Route 53…).</p>
          </div>

          <!-- Routing record: apex vs subdomain -->
          <div v-if="isApex" class="space-y-3">
            <div class="rounded-xl t-bg-subtle p-3 text-sm space-y-2">
              <p class="font-medium t-text">Root domain — pick whichever your provider supports:</p>
              <ul class="space-y-1.5 t-text-muted">
                <li><strong class="t-text">ALIAS / ANAME</strong> record: <span class="font-mono">@ → {{ mainDomain }}</span> (Cloudflare, Route 53, DNSimple…)</li>
                <li><strong class="t-text">A</strong> record: <span class="font-mono">@ → your platform's IP</span> (ask your operator for the address)</li>
                <li><strong class="t-text">Or</strong> CNAME <span class="font-mono">www → {{ mainDomain }}</span> and 301-redirect the root to <span class="font-mono">www</span></li>
              </ul>
            </div>
          </div>
          <div v-else class="rounded-xl t-bg-subtle p-3 text-sm">
            <p class="font-medium t-text mb-1">Subdomain</p>
            <p class="t-text-muted">Add a <strong class="t-text">CNAME</strong> record: <span class="font-mono">{{ (org?.custom_domain||'').split('.')[0] }} → {{ mainDomain }}</span></p>
          </div>

          <template v-if="cfg.record_name">
          <div>
            <h2 class="font-semibold t-text">2. Add the verification record</h2>
            <p class="text-sm t-text-muted mt-0.5">Proves you own the domain. We check this when you verify.</p>
          </div>
          <div class="rounded-xl border t-border divide-y t-border text-sm">
            <div class="grid grid-cols-[5rem_1fr_auto] items-center gap-2 p-3">
              <span class="t-text-muted">Type</span><span class="font-mono">TXT</span><span />
            </div>
            <div class="grid grid-cols-[5rem_1fr_auto] items-center gap-2 p-3">
              <span class="t-text-muted">Name</span>
              <span class="font-mono break-all">{{ cfg.record_name }}</span>
              <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="copy(cfg.record_name)"><Icon name="lucide:copy" class="w-4 h-4" /></Button>
            </div>
            <div class="grid grid-cols-[5rem_1fr_auto] items-center gap-2 p-3">
              <span class="t-text-muted">Value</span>
              <span class="font-mono break-all">{{ cfg.record_value }}</span>
              <Button variant="ghost" size="sm" class="w-8 h-8 p-0" @click="copy(cfg.record_value)"><Icon name="lucide:copy" class="w-4 h-4" /></Button>
            </div>
          </div>

          <div class="flex items-center gap-3 pt-1">
            <Button class="rounded-full" :disabled="verifying" @click="verify">
              <Icon v-if="verifying" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
              <Icon v-else name="lucide:badge-check" class="w-4 h-4 mr-2" />
              {{ isVerified ? "Re-check" : "Verify domain" }}
            </Button>
            <p class="text-xs t-text-muted">DNS changes can take a few minutes to propagate. SSL is issued automatically once verified.</p>
          </div>
          </template>
        </div>
      </template>
    </PageContainer>
  </div>
</template>

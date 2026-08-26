<script setup lang="ts">
import type { HoaMember } from "#core/types/directus";
import { residencyFor, RESIDENCY_UNIT_FIELDS } from "#core/shared/members/residency";

// Audience overview — who receives your communications, grouped the same way the
// composer targets them (All / Owners / Tenants). Each group deep-links into the
// composer pre-filtered (`?audience=`). Read-only; reuses member data, no backend.
definePageMeta({
  middleware: ["admin", "subscription"],
  layout: "auth",
});

const { buildOrgPath } = useOrgNavigation();
const { selectedOrgId } = await useSelectedOrg();
const { list } = useDirectusItems<HoaMember>("hoa_members");

const orgId = computed(() => selectedOrgId.value);

const { data: members, pending } = await useAsyncData(
  `comms-audience-${orgId.value}`,
  async () => {
    if (!orgId.value) return [] as HoaMember[];
    const rows = await list({
      // The unit-link fields residencyFor() reads. These counts are the promise
      // the composer then has to keep — if they are resolved differently, the
      // "Owners · 34" an admin clicks lands on a list of some other size.
      fields: ["id", "member_type", "user", "email", ...RESIDENCY_UNIT_FIELDS],
      filter: {
        organization: { _eq: orgId.value },
        status: { _in: ["active", "inactive", "pending"] },
      },
      limit: -1,
    });
    return (rows || []) as HoaMember[];
  },
  { watch: [orgId], server: false },
);

const all = computed(() => members.value || []);
const withEmail = computed(() => all.value.filter((m) => !!m.email).length);
const withLogin = computed(() => all.value.filter((m) => !!m.user).length);

const groups = computed(() => [
  {
    key: "all" as const,
    label: "All members",
    description: "Everyone in the community directory.",
    icon: "lucide:users",
    count: all.value.length,
  },
  {
    key: "owners" as const,
    label: "Owners",
    description: "Property owners only.",
    icon: "lucide:home",
    count: all.value.filter((m) => residencyFor(m as any) === "owner").length,
  },
  {
    key: "tenants" as const,
    label: "Tenants",
    description: "Renters / non-owner residents.",
    icon: "lucide:key",
    count: all.value.filter((m) => residencyFor(m as any) === "tenant").length,
  },
]);

const composeTo = (audience: "all" | "owners" | "tenants") =>
  navigateTo(buildOrgPath(`/admin/communications/compose?audience=${audience}`));
</script>

<template>
  <div class="ui-kit accent-cyan min-h-screen t-bg">
    <PageContainer>
      <CommunicationsTabs />

      <WidgetGlass strong class="mb-8">
        <p class="text-xs uppercase tracking-widest t-text-tertiary mb-1.5">Communications · Audience</p>
        <h1 class="text-3xl font-semibold tracking-tight t-text">Audience</h1>
        <p class="t-text-secondary mt-1">
          Who receives your emails. Send to a whole group in one tap.
        </p>
      </WidgetGlass>

      <WidgetRowSkeleton v-if="pending" :rows="3" avatar-shape="square" />

      <template v-else>
        <!-- Reach summary -->
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent class="pt-6">
              <p class="text-2xl font-bold t-text">{{ all.length }}</p>
              <p class="text-sm t-text-secondary">Total members</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="pt-6">
              <p class="text-2xl font-bold t-text">{{ withEmail }}</p>
              <p class="text-sm t-text-secondary">Reachable by email</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent class="pt-6">
              <p class="text-2xl font-bold t-text">{{ withLogin }}</p>
              <p class="text-sm t-text-secondary">Have portal login</p>
            </CardContent>
          </Card>
        </div>

        <!-- Groups -->
        <StaggerList :items="groups" class="space-y-3" v-slot="{ item: g }">
          <Card class="p-5">
            <div class="flex items-center gap-4">
              <span class="flex h-11 w-11 items-center justify-center rounded-xl t-bg-accent/15 t-text-accent shrink-0">
                <Icon :name="g.icon" class="h-5 w-5" />
              </span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <h3 class="font-semibold t-text">{{ g.label }}</h3>
                  <span class="text-xs font-medium t-text-muted">{{ g.count }} {{ g.count === 1 ? 'member' : 'members' }}</span>
                </div>
                <p class="text-sm t-text-muted">{{ g.description }}</p>
              </div>
              <Button class="rounded-full shrink-0" :disabled="g.count === 0" @click="composeTo(g.key)">
                <Icon name="lucide:mail" class="w-4 h-4 mr-1.5" />
                Compose
              </Button>
            </div>
          </Card>
        </StaggerList>

        <p class="text-xs t-text-muted mt-4">
          Need a specific list? Use <strong>Select specific recipients</strong> in the composer.
        </p>
      </template>
    </PageContainer>
  </div>
</template>

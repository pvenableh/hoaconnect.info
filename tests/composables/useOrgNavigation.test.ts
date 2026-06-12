import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref, reactive } from "vue";
import { useOrgNavigation } from "~/composables/useOrgNavigation";

let route: { params: Record<string, string | undefined> };
let activeHoa: ReturnType<typeof ref<{ slug?: string } | null>>;
let navigateToSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  route = reactive({ params: {} });
  activeHoa = ref<{ slug?: string } | null>(null);
  navigateToSpy = vi.fn();
  vi.stubGlobal("useRoute", () => route);
  vi.stubGlobal("useActiveHoa", () => ({ activeHoa }));
  vi.stubGlobal("navigateTo", navigateToSpy);
});

describe("buildOrgPath", () => {
  it("prefixes paths with the route slug", () => {
    route.params.slug = "1033-lenox";
    const { buildOrgPath } = useOrgNavigation();
    expect(buildOrgPath("/rules")).toBe("/1033-lenox/rules");
  });

  it("normalizes paths missing a leading slash", () => {
    route.params.slug = "1033-lenox";
    const { buildOrgPath } = useOrgNavigation();
    expect(buildOrgPath("rules")).toBe("/1033-lenox/rules");
  });

  it("does not double-prefix an already org-scoped path", () => {
    route.params.slug = "1033-lenox";
    const { buildOrgPath } = useOrgNavigation();
    expect(buildOrgPath("/1033-lenox/rules")).toBe("/1033-lenox/rules");
    expect(buildOrgPath("/1033-lenox")).toBe("/1033-lenox");
  });

  it("falls back to the host-resolved org slug on custom domains (no route slug)", () => {
    activeHoa.value = { slug: "605-lincoln" };
    const { buildOrgPath } = useOrgNavigation();
    expect(buildOrgPath("/rules")).toBe("/605-lincoln/rules");
  });

  it("returns the path unchanged when no slug can be resolved", () => {
    const { buildOrgPath } = useOrgNavigation();
    expect(buildOrgPath("/rules")).toBe("/rules");
  });

  it("prefers the route slug over the active org slug", () => {
    route.params.slug = "1033-lenox";
    activeHoa.value = { slug: "605-lincoln" };
    const { buildOrgPath } = useOrgNavigation();
    expect(buildOrgPath("/rules")).toBe("/1033-lenox/rules");
  });
});

describe("isOrgRoute / navigateToOrg", () => {
  it("isOrgRoute reflects slug availability from either source", () => {
    const nav = useOrgNavigation();
    expect(nav.isOrgRoute.value).toBe(false);
    activeHoa.value = { slug: "605-lincoln" };
    expect(nav.isOrgRoute.value).toBe(true);
  });

  it("navigateToOrg navigates to the org-prefixed path", () => {
    route.params.slug = "1033-lenox";
    const { navigateToOrg } = useOrgNavigation();
    navigateToOrg("/documents");
    expect(navigateToSpy).toHaveBeenCalledWith("/1033-lenox/documents");
  });
});

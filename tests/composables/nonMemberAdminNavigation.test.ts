import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";

// import.meta.client is undefined under vitest, so the notice never shows
// here; its text is tested with nonMemberAdminNotice in domains-org-routes.
vi.mock("vue-sonner", () => ({ toast: { info: vi.fn() } }));

const navigateTo = vi.fn((path: string) => ({ redirectedTo: path }));
vi.stubGlobal("navigateTo", navigateTo);

const { nonMemberAdminNavigation } = await import("#core/app/composables/nonMemberAdminNavigation");

const lenox = { organization: { slug: "1033-lenox", name: "1033 Lenox" } };

function state(memberships: any[], current: any = memberships[0] ?? null, loading = false) {
  return {
    currentOrg: ref(current),
    memberships: ref(memberships),
    isLoading: ref(loading),
  } as any;
}

function route(fullPath: string, slug?: string) {
  return { fullPath, params: slug ? { slug } : {} } as any;
}

beforeEach(() => {
  navigateTo.mockClear();
});

describe("nonMemberAdminNavigation", () => {
  it("leaves a member of the viewed community where they are", () => {
    const out = nonMemberAdminNavigation(route("/1033-lenox/manage", "1033-lenox"), state([lenox]));
    expect(out).toBeUndefined();
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("sends a non-member admin to the same page in their own community, query kept", () => {
    const out = nonMemberAdminNavigation(
      route("/transition-test/manage/inquiries?tab=open", "transition-test"),
      state([lenox]),
      "page"
    );
    expect(out).toEqual({ redirectedTo: "/1033-lenox/manage/inquiries?tab=open" });
  });

  it("sends an admin with no community of their own to the viewed one's public page", () => {
    const out = nonMemberAdminNavigation(route("/transition-test/manage", "transition-test"), state([], null));
    expect(out).toEqual({ redirectedTo: "/transition-test" });
  });

  it("waits while memberships are still loading", () => {
    const out = nonMemberAdminNavigation(route("/transition-test/manage", "transition-test"), state([], null, true));
    expect(out).toBeUndefined();
  });

  it("does nothing off an org route", () => {
    expect(nonMemberAdminNavigation(route("/dashboard"), state([lenox]))).toBeUndefined();
  });
});

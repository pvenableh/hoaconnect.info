import { describe, it, expect, vi, beforeEach } from "vitest";
import { reactive, nextTick } from "vue";
import {
  useAppSlideOverStack,
  useAppSlideOver,
  useAppSlideOverStackUrlSync,
  useSlideOverFocusTrapSuspend,
  useSlideOverFlips,
} from "~/composables/useAppSlideOverStack";

let route: { query: Record<string, unknown> };
let pushes: Array<{ query: Record<string, unknown> }>;
let replaces: Array<{ query: Record<string, unknown> }>;
let backs: number;

beforeEach(() => {
  route = reactive({ query: {} as Record<string, unknown> });
  pushes = [];
  replaces = [];
  backs = 0;
  vi.stubGlobal("useRoute", () => route);
  vi.stubGlobal("useRouter", () => ({
    push: async (to: { query: Record<string, unknown> }) => {
      pushes.push(to);
      route.query = to.query; // emulate navigation landing
    },
    replace: async (to: { query: Record<string, unknown> }) => {
      replaces.push(to);
      route.query = to.query;
    },
    back: () => {
      backs++;
    },
  }));
});

describe("push semantics", () => {
  it("serialises a single panel onto ?slide", async () => {
    const { push } = useAppSlideOverStack();
    useAppSlideOverStackUrlSync();
    await push("request", "abc");
    expect(route.query.slide).toBe("request:abc");
  });

  it("includes mode as a third segment", async () => {
    const { push } = useAppSlideOverStack();
    await push("request", "abc", { mode: "board" });
    expect(route.query.slide).toBe("request:abc:board");
  });

  it("same-type push replaces the top instead of deepening", async () => {
    const { push } = useAppSlideOverStack();
    useAppSlideOverStackUrlSync();
    await push("request", "a");
    await nextTick();
    await push("request", "b");
    expect(route.query.slide).toBe("request:b");
  });

  it("different-type push stacks two deep", async () => {
    const { push, depth } = useAppSlideOverStack();
    useAppSlideOverStackUrlSync();
    await push("project", "p1");
    await nextTick();
    await push("task", "t1");
    await nextTick();
    expect(route.query.slide).toBe("project:p1/task:t1");
    expect(depth.value).toBe(2);
  });

  it("pushing onto a full stack replaces the top, keeps the bottom", async () => {
    const { push } = useAppSlideOverStack();
    useAppSlideOverStackUrlSync();
    await push("project", "p1");
    await nextTick();
    await push("task", "t1");
    await nextTick();
    await push("request", "r1");
    await nextTick();
    expect(route.query.slide).toBe("project:p1/request:r1");
  });

  it("preserves unrelated query params", async () => {
    route.query = { tab: "open" };
    const { push } = useAppSlideOverStack();
    await push("request", "abc");
    expect(route.query).toMatchObject({ tab: "open", slide: "request:abc" });
  });
});

describe("URL sync (paste-a-link)", () => {
  it("hydrates the stack from an existing ?slide param", async () => {
    route.query = { slide: "project:p1/task:t2" };
    useAppSlideOverStackUrlSync();
    const { stack, depth } = useAppSlideOverStack();
    await nextTick();
    expect(depth.value).toBe(2);
    expect(stack.value[0]).toMatchObject({ type: "project", id: "p1" });
    expect(stack.value[1]).toMatchObject({ type: "task", id: "t2" });
  });

  it("ignores malformed segments and caps depth at 2", async () => {
    route.query = { slide: "junk/a:1/b:2/c:3" };
    useAppSlideOverStackUrlSync();
    const { stack } = useAppSlideOverStack();
    await nextTick();
    // "junk" has no id → dropped; only first 2 segments considered.
    expect(stack.value).toHaveLength(1);
    expect(stack.value[0]).toMatchObject({ type: "a", id: "1" });
  });

  it("decodes encoded ids", async () => {
    route.query = { slide: `request:${encodeURIComponent("id/with:chars")}` };
    useAppSlideOverStackUrlSync();
    const { stack } = useAppSlideOverStack();
    await nextTick();
    expect(stack.value[0]?.id).toBe("id/with:chars");
  });
});

describe("pop semantics", () => {
  it("strips the slide param in-place when there is no history marker (pasted URL)", async () => {
    route.query = { slide: "request:abc", tab: "open" };
    useAppSlideOverStackUrlSync();
    const { pop } = useAppSlideOverStack();
    await pop();
    expect(replaces).toHaveLength(1);
    expect(route.query).toEqual({ tab: "open" });
    expect(backs).toBe(0);
  });
});

describe("useAppSlideOver (per-type binding)", () => {
  it("reports open/activeId only when its type is on top", async () => {
    route.query = {};
    useAppSlideOverStackUrlSync();
    const requestSlide = useAppSlideOver("request");
    const taskSlide = useAppSlideOver("task");

    await requestSlide.open("r9");
    await nextTick();
    expect(requestSlide.isOpen.value).toBe(true);
    expect(requestSlide.activeId.value).toBe("r9");
    expect(taskSlide.isOpen.value).toBe(false);
    expect(taskSlide.activeId.value).toBeNull();
  });

  it("stashes a FLIP payload for the stack to consume", async () => {
    const slide = useAppSlideOver("request");
    const payload = { rect: { x: 1, y: 2, width: 3, height: 4 }, html: "<div/>" };
    await slide.open("r1", { flipFrom: payload });
    const flips = useSlideOverFlips();
    expect(flips.value["request:r1"]).toEqual(payload);
  });
});

describe("useSlideOverFocusTrapSuspend", () => {
  it("counts suspends and releases idempotently", () => {
    const { count, suspend } = useSlideOverFocusTrapSuspend();
    const release1 = suspend();
    const release2 = suspend();
    expect(count.value).toBe(2);
    release1();
    release1(); // double-release is a no-op
    expect(count.value).toBe(1);
    release2();
    expect(count.value).toBe(0);
  });
});

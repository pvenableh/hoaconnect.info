/**
 * AppInput / AppTextarea (app/components/App/) dress the stock shadcn-vue Input
 * and Textarea and declare only `class`. Everything else — v-model and its
 * modifiers, listeners, attributes — has to fall through to the stock
 * component untouched, and the stock `px-3` has to be gone from the class list
 * (theme-app.css's padding sniff reads `[class*="px-"]`).
 *
 * `modelModifiers` is what `v-model.number` compiles to; Vue applies it in the
 * emitting component (the stock one), so it only works if it falls through.
 */
import { describe, it, expect } from "vitest";
import { h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import AppInput from "~/components/App/Input.vue";
import AppTextarea from "~/components/App/Textarea.vue";

const fields = [
  ["AppInput", AppInput, "input", "py-1"],
  ["AppTextarea", AppTextarea, "textarea", "py-2"],
] as const;

describe.each(fields)("%s", (_name, Field, tag, py) => {
  it("v-model reaches the stock field both ways", async () => {
    const model = ref("a");
    const w = mount({
      render: () => h(Field, { "modelValue": model.value, "onUpdate:modelValue": (v: string) => (model.value = v) }),
    });
    const el = w.find(tag);
    expect((el.element as HTMLInputElement).value).toBe("a");
    await el.setValue("b");
    expect(model.value).toBe("b");
    model.value = "c";
    await nextTick();
    expect((el.element as HTMLInputElement).value).toBe("c");
  });

  it("v-model.number's modifier falls through", async () => {
    const got: unknown[] = [];
    const w = mount(Field, {
      props: { "modelValue": 1, "modelModifiers": { number: true }, "onUpdate:modelValue": (v: unknown) => got.push(v) },
    } as never);
    await w.find(tag).setValue("42");
    expect(got.at(-1)).toBe(42);
  });

  it("wears field-underline, without the stock px-3, and keeps the caller's padding", () => {
    const w = mount(Field, { props: { class: "pl-9 mt-1" }, attrs: { placeholder: "x", rows: 2 } } as never);
    const cls = w.find(tag).classes();
    expect(cls).toEqual(expect.arrayContaining(["field-underline", "p-0", py, "pl-9", "mt-1"]));
    expect(cls).not.toContain("px-3");
    expect(w.find(tag).attributes("placeholder")).toBe("x");
  });
});

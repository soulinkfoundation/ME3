import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import IconPicker from "./IconPicker.vue";

vi.mock("vue3-emoji-picker", () => ({
  default: { name: "EmojiPicker", template: "<div />" },
}));

function mountPicker() {
  return mount(IconPicker, {
    attachTo: document.body,
    props: {
      modelValue: "🧙",
      ariaLabel: "Project icon",
    },
    global: {
      stubs: {
        EmojiPicker: true,
        UiIcon: true,
      },
    },
  });
}

describe("IconPicker", () => {
  it("closes from the usual popover escape hatches", async () => {
    const wrapper = mountPicker();

    await wrapper.get(".trigger-btn").trigger("click");
    expect(wrapper.find(".picker-dropdown").exists()).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await nextTick();
    expect(wrapper.find(".picker-dropdown").exists()).toBe(false);

    await wrapper.get(".trigger-btn").trigger("click");
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await nextTick();
    expect(wrapper.find(".picker-dropdown").exists()).toBe(false);

    await wrapper.get(".trigger-btn").trigger("click");
    await wrapper.get(".clear-btn").trigger("click");
    expect(wrapper.find(".picker-dropdown").exists()).toBe(false);
  });
});

import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import AppDialog from "./AppDialog.vue";

describe("AppDialog", () => {
  beforeEach(() => {
    vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(
      function showModal(this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    );
    vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(
      function close(this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("uses the native modal dialog lifecycle and exposes its label", async () => {
    const wrapper = mount(AppDialog, {
      attachTo: document.body,
      props: { open: true, labelledBy: "dialog-title" },
      slots: { default: '<h2 id="dialog-title">Compose</h2>' },
    });
    await nextTick();

    const dialog = document.body.querySelector("dialog");
    expect(dialog?.hasAttribute("open")).toBe(true);
    expect(dialog?.getAttribute("aria-labelledby")).toBe("dialog-title");

    await wrapper.setProps({ open: false });
    await nextTick();
    expect(dialog?.hasAttribute("open")).toBe(false);
    wrapper.unmount();
  });

  it("requests close for Escape and permitted backdrop clicks", async () => {
    const wrapper = mount(AppDialog, {
      attachTo: document.body,
      props: { open: true, closeOnBackdrop: true },
      slots: { default: "<button>Keep focus inside</button>" },
    });
    await nextTick();

    const dialog = document.body.querySelector("dialog") as HTMLDialogElement;
    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    dialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(cancel.defaultPrevented).toBe(true);
    expect(wrapper.emitted("close")).toHaveLength(2);
    wrapper.unmount();
  });
});

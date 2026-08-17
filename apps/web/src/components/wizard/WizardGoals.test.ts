import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api";
import WizardGoals from "./WizardGoals.vue";

vi.mock("../../api", () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

const toastHarness = vi.hoisted(() => ({
  success: vi.fn(),
}));

vi.mock("../../composables/useAppToast", () => ({
  useAppToast: () => ({ toastSuccess: toastHarness.success }),
}));

describe("WizardGoals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({
      settings: {
        goals: [{ id: "goal-1", title: "Publish four videos", status: "active" }],
      },
    });
    vi.mocked(api.patch).mockResolvedValue({
      settings: {
        goals: [{ id: "goal-1", title: "Publish five videos", status: "active" }],
      },
    });
  });

  it("reports a successful save with a toast instead of inline status copy", async () => {
    const wrapper = mount(WizardGoals, {
      global: {
        stubs: {
          Button: { template: '<button type="button"><slot /></button>' },
          UiIcon: { template: '<span aria-hidden="true" />' },
        },
      },
    });
    await flushPromises();

    expect(wrapper.get(".section-desc").text()).toBe(
      "Keep the outcomes you are actively working towards here.",
    );

    const input = wrapper.get(".goal-input");
    await input.setValue("Publish five videos");
    await input.trigger("change");
    await flushPromises();

    expect(api.patch).toHaveBeenCalledWith("/mission-control/dashboard", {
      goals: [
        { id: "goal-1", title: "Publish five videos", status: "active" },
      ],
    });
    expect(toastHarness.success).toHaveBeenCalledWith("Goals saved");
    expect(wrapper.text()).not.toContain("Goals saved");
  });
});

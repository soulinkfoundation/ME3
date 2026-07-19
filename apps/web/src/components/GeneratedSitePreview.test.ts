import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useWizardStore } from "../stores/wizard";
import GeneratedSitePreview from "./GeneratedSitePreview.vue";

describe("GeneratedSitePreview", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it("renders unsaved wizard state with the production site renderer", async () => {
    const wizard = useWizardStore();
    wizard.profile.name = "Preview Person";
    wizard.profile.handle = "preview-person";
    wizard.profile.bio = "An unsaved generated preview.";

    const wrapper = mount(GeneratedSitePreview);
    expect(wrapper.find("iframe").exists()).toBe(false);
    expect(wrapper.get('[role="status"]').text()).toBe("Generating preview…");

    await flushPromises();

    const frame = wrapper.get("iframe");
    const html = frame.attributes("srcdoc");
    expect(frame.attributes("sandbox")).toBe("allow-scripts");
    expect(html).toContain("Preview Person");
    expect(html).toContain("An unsaved generated preview.");
    expect(html).toContain("me3-preview-navigation");
  });
});

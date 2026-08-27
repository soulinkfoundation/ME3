import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import CampaignEmailPreview from "./CampaignEmailPreview.vue";

describe("CampaignEmailPreview", () => {
  it("renders the campaign envelope and content", () => {
    const wrapper = mount(CampaignEmailPreview, {
      props: {
        subject: "August update",
        senderName: "Kieran",
        fromAddress: "news@example.com",
        replyToAddress: "hello@example.com",
        toLabel: "@kieran subscribers",
        html: "<p>Hello readers</p>",
      },
    });

    expect(wrapper.text()).toContain("August update");
    expect(wrapper.text()).toContain("Kieran <news@example.com>");
    expect(wrapper.text()).toContain("@kieran subscribers");
    expect(wrapper.text()).toContain("hello@example.com");
    expect(wrapper.get("iframe").attributes("srcdoc")).toBe("<p>Hello readers</p>");
  });

  it("switches between desktop and mobile preview widths", async () => {
    const wrapper = mount(CampaignEmailPreview);

    expect(wrapper.get(".email-frame").classes()).toContain("email-frame--desktop");
    await wrapper.get("button:nth-of-type(2)").trigger("click");
    expect(wrapper.get(".email-frame").classes()).toContain("email-frame--mobile");
    expect(wrapper.get("button:nth-of-type(2)").attributes("aria-pressed")).toBe("true");
  });
});

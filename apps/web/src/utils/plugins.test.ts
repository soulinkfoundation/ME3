import { describe, expect, it } from "vitest";
import {
  isPluginComingSoon,
  isPluginHiddenFromList,
  type PluginRecord,
} from "./plugins";

const plugin = {
  id: "me3.social-publishing",
  showInPluginList: true,
  status: "available",
  releaseStage: "available",
  activationAllowed: true,
} as PluginRecord;

describe("plugin catalog state", () => {
  it("uses server-provided visibility and release state", () => {
    expect(isPluginHiddenFromList(plugin)).toBe(false);
    expect(isPluginComingSoon(plugin)).toBe(false);
    expect(isPluginHiddenFromList({ ...plugin, showInPluginList: false })).toBe(true);
    expect(isPluginComingSoon({ ...plugin, releaseStage: "coming_soon" })).toBe(true);
  });
});

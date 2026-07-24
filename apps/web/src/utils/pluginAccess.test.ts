import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import {
  ensurePluginAccess,
  invalidatePluginAccess,
  isPluginAccessEnabled,
} from "./pluginAccess";

vi.mock("../api", () => ({
  api: {
    get: vi.fn(),
  },
}));

describe("plugin access cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidatePluginAccess();
  });

  it("deduplicates concurrent access checks and reuses the result", async () => {
    vi.mocked(api.get).mockResolvedValue({
      plugins: [
        {
          id: "me3.mission-control",
          status: "installed",
          enabled: true,
        },
      ],
    });

    const [plugins, enabled] = await Promise.all([
      ensurePluginAccess(),
      isPluginAccessEnabled("me3.mission-control"),
    ]);
    await ensurePluginAccess();

    expect(plugins).toHaveLength(1);
    expect(enabled).toBe(true);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("reloads plugin access after invalidation", async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ plugins: [] })
      .mockResolvedValueOnce({
        plugins: [
          {
            id: "me3.calendar",
            status: "installed",
            enabled: true,
          },
        ],
      });

    expect(await isPluginAccessEnabled("me3.calendar")).toBe(false);
    invalidatePluginAccess();
    expect(await isPluginAccessEnabled("me3.calendar")).toBe(true);
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});

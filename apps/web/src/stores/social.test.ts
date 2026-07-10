import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { api } from "../api";
import { useSocialStore, type SocialContentVariant } from "./social";

vi.mock("../api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class extends Error {},
}));

describe("social store package workflow", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("loads source-backed packages for one site", async () => {
    vi.mocked(api.get).mockResolvedValue({ packages: [{ package: { id: "package-1" }, variants: [] }] });

    const result = await useSocialStore().fetchContentPackages("site one");

    expect(result).toHaveLength(1);
    expect(api.get).toHaveBeenCalledWith("/social/packages?siteId=site%20one");
  });

  it("updates one exact account variant", async () => {
    const variant = {
      id: "variant-1",
      packageId: "package-1",
      platform: "linkedin",
      approvalStatus: "approved",
    } as SocialContentVariant;
    vi.mocked(api.patch).mockResolvedValue({ variant });

    const result = await useSocialStore().updateContentVariant("variant-1", {
      targetAccountId: "account-1",
      approvalStatus: "approved",
    });

    expect(result).toBe(variant);
    expect(api.patch).toHaveBeenCalledWith("/social/variants/variant-1", {
      targetAccountId: "account-1",
      approvalStatus: "approved",
    });
  });
});

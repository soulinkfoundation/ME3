import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePublish } from "./usePublish";
import { useSitesStore } from "../stores/sites";
import { useWizardStore } from "../stores/wizard";

describe("usePublish site role", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("claims a new additional site without renaming the profile", async () => {
    const wizard = useWizardStore();
    wizard.username = "studio";
    wizard.setSiteRole("organization");
    wizard.updateProfile({ name: "Studio", handle: "studio" });

    const sites = useSitesStore();
    sites.sites = [
      {
        id: "profile-owner",
        username: "owner",
        user_id: "owner-id",
        site_type: "profile",
        site_role: "profile",
        custom_domain: null,
        custom_domain_status: null,
        created_at: "2026-08-20T09:00:00.000Z",
        updated_at: "2026-08-20T09:00:00.000Z",
        published_at: "2026-08-20T10:00:00.000Z",
      },
    ];
    sites.fetchSites = vi.fn(async () => undefined) as never;
    sites.claimUsername = vi.fn(async () => ({
      id: "site-studio",
      username: "studio",
      user_id: "owner-id",
      site_type: "profile",
      site_role: "organization",
      custom_domain: null,
      custom_domain_status: null,
      created_at: "2026-08-24T09:00:00.000Z",
      updated_at: "2026-08-24T09:00:00.000Z",
      published_at: null,
    })) as never;
    sites.fetchPublishManifest = vi.fn(async () => ({
      version: 1,
      sourceFiles: {},
      assetFiles: {},
      updatedAt: "2026-08-24T09:00:00.000Z",
    })) as never;
    sites.uploadSite = vi.fn(async () => true) as never;

    const { publish } = usePublish();
    const success = await publish({ celebrate: false, openSite: false });

    expect(success).toBe(true);
    expect(sites.claimUsername).toHaveBeenCalledWith("studio", {
      siteType: "profile",
      siteRole: "organization",
    });
    expect(sites.uploadSite).toHaveBeenCalledWith(
      "studio",
      expect.arrayContaining([expect.objectContaining({ name: "me.json" })]),
    );
  });
});

import { test, expect } from "./fixtures/test";

test.describe("/start onboarding wizard", () => {
  test.beforeEach(async ({ page }) => {
    let publishedSite: null | {
      id: string;
      username: string;
      user_id: string;
      site_type: "profile";
      template_id: null;
      custom_domain: null;
      custom_domain_status: null;
      created_at: string;
      updated_at: string;
      published_at: string | null;
    } = null;

    await page.route("**/api/auth/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          user: {
            id: "owner-1",
            email: "owner@example.com",
            name: "ME3 Core Owner",
            username: "owner",
            timezone: null,
          },
        }),
      });
    });

    await page.route("**/api/plugins", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ plugins: [] }),
      });
    });

    await page.route("**/api/sites", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ sites: publishedSite ? [publishedSite] : [] }),
        });
        return;
      }

      if (route.request().method() === "POST") {
        const body = JSON.parse(route.request().postData() || "{}") as {
          username?: string;
        };
        publishedSite = {
          id: "site-1",
          username: body.username || "starter",
          user_id: "owner-1",
          site_type: "profile",
          template_id: null,
          custom_domain: null,
          custom_domain_status: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          published_at: null,
        };
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ site: publishedSite }),
        });
        return;
      }

      await route.fallback();
    });

    await page.route("**/api/sites/*/publish-manifest", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          manifest: {
            version: 1,
            sourceFiles: {},
            assetFiles: {},
            updatedAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.route("**/api/sites/*/upload", async (route) => {
      if (publishedSite) {
        publishedSite = {
          ...publishedSite,
          published_at: new Date().toISOString(),
        };
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          publishedAt: new Date().toISOString(),
        }),
      });
    });

    await page.route("**/api/mailbox", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            tier: "core",
            available: true,
            approvalRequired: true,
            cloudflareManaged: true,
            suggestedAliasLocalPart: "starter",
            mailbox: null,
            sources: [],
            recentActivity: [],
          }),
        });
        return;
      }

      if (route.request().method() === "PUT") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            mailbox: {
              id: "mailbox-1",
              aliasLocalPart: "starter",
              aliasAddress: "starter@example.com",
              forwardingEmail: "",
              forwardingStatus: "pending",
              forwardingEnabled: false,
              forwardingMode: "me3_only",
              status: "pending_setup",
              approvalPolicy: "all",
              dailyInboundLimit: 100,
              dailyOutboundLimit: 100,
              activatedAt: null,
              forwardingVerifiedAt: null,
              cloudflareDestinationId: null,
              cloudflareRuleId: null,
              cloudflareLastSyncedAt: null,
              cloudflareLastError: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            sources: [],
          }),
        });
        return;
      }

      await route.fallback();
    });

    await page.route("**/api/mailbox/activate", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mailbox: {
            aliasLocalPart: "starter",
            status: "active",
            forwardingEnabled: false,
            forwardingEmail: "",
          },
        }),
      });
    });

    await page.route("**/api/email-provider-settings", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          encryptionConfigured: true,
          activeProviderId: "cloudflare-email",
          providers: [{ id: "cloudflare-email" }],
          futureProviders: [],
        }),
      });
    });

    await page.route("**/api/soulink/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          available: true,
          configured: true,
          apiOrigin: "https://soulinkfoundation.org",
          runtimeCallbackUrl:
            "http://localhost:8787/api/agent/channels/soulink/dispatch",
          connection: null,
        }),
      });
    });

    await page.route("**/api/soulink/setup", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          available: true,
          configured: true,
          apiOrigin: "https://soulinkfoundation.org",
          runtimeCallbackUrl:
            "http://localhost:8787/api/agent/channels/soulink/dispatch",
          connection: {
            id: "soulink-connection-1",
            channel: "soulink",
            status: "active",
            ownerNodeId: "node-owner",
            assistantNodeId: "node-assistant",
            streamChannelType: "messaging",
            streamChannelId: "assistant-channel",
            soulinkChatUrl:
              "https://soulinkfoundation.org/chats/assistant-channel",
            connectedAt: new Date().toISOString(),
            disconnectedAt: null,
            lastInboundAt: null,
            lastOutboundAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
      });
    });
  });

  test("redirects authenticated first-time users to /start", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/start$/);
    await expect(
      page.getByRole("heading", {
        name: "Let's get started with ME3",
      }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Exit" })).toHaveCount(0);
    await expect(page.locator(".step-indicator")).toHaveCount(0);
    await expect(page.locator(".progress-step")).toHaveCount(3);
    await expect(page.getByRole("link", { name: "ME3 site profile" })).toHaveAttribute(
      "target",
      "_blank",
    );

    await page.locator(".progress-step").first().hover();
    const tooltipBox = await page
      .locator(".progress-step")
      .first()
      .locator(".progress-step-tooltip")
      .boundingBox();
    expect(tooltipBox).not.toBeNull();
    expect(tooltipBox?.y).toBeGreaterThanOrEqual(0);
  });

  test("checks persisted handle availability on refresh", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "me3_wizard_state",
        JSON.stringify({
          ownerUserId: "owner-1",
          currentStep: 1,
          furthestStep: 1,
          profile: {
            name: "Refresh User",
            handle: "refreshhandle",
            location: "",
            bio: "",
            avatar: null,
            banner: null,
            links: {},
            linkOrder: [],
            buttons: [],
          },
          pages: [],
          posts: [],
          products: [],
          testimonials: [],
          username: "refreshhandle",
        }),
      );
    });

    await page.goto("/start");

    await expect(page.locator("#start-handle")).toHaveValue("refreshhandle");
    await expect(page.getByText("refreshhandle is available.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  test("validates profile step before allowing publish", async ({ page }) => {
    await page.goto("/start");

    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
    await page.locator("#start-name").fill("A");
    await page.locator("#start-handle").fill("ab");
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
    await expect(
      page.getByText("Handle must be at least 3 characters."),
    ).toBeVisible();
  });

  test("publishes minimal profile and allows optional steps to be skipped", async ({
    page,
  }) => {
    let uploadBody = "";
    await page.route("**/api/sites/*/upload", async (route) => {
      uploadBody = route.request().postData() || "";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          publishedAt: new Date().toISOString(),
        }),
      });
    });

    await page.goto("/start");
    await page.locator("#start-name").fill("Starter User");
    await page.locator("#start-handle").fill("starter");
    await expect(page.getByText("starter is available.")).toBeVisible();

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("heading", { name: "Set up email" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Skip for now" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Account settings" })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(uploadBody).toContain("me.json");
    expect(uploadBody).toContain("Starter User");
    expect(uploadBody).toContain("starter");

    await page.getByRole("button", { name: "Skip for now" }).click();
    await expect(
      page.getByRole("heading", { name: "Connect Soulink" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Account settings" })).toHaveAttribute(
      "target",
      "_blank",
    );

    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page).toHaveURL(/\/sites\/starter$/);
  });

  test("saves default Cloudflare email setup", async ({ page }) => {
    let mailboxPayload = "";
    let providerPayload = "";

    await page.route("**/api/mailbox", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            available: true,
            suggestedAliasLocalPart: "starter",
            mailbox: null,
          }),
        });
        return;
      }
      mailboxPayload = route.request().postData() || "";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mailbox: {
            aliasLocalPart: "starter",
            status: "active",
            forwardingEnabled: false,
            forwardingEmail: "",
          },
          sources: [],
        }),
      });
    });

    await page.route("**/api/email-provider-settings", async (route) => {
      providerPayload = route.request().postData() || "";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          encryptionConfigured: true,
          activeProviderId: "cloudflare-email",
          providers: [{ id: "cloudflare-email" }],
          futureProviders: [],
        }),
      });
    });

    await page.goto("/start");
    await page.locator("#start-name").fill("Starter User");
    await page.locator("#start-handle").fill("starter");
    await expect(page.getByText("starter is available.")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(
      page.getByText(
        "This address receives routed mail and sends with Cloudflare by default.",
      ),
    ).toHaveCount(0);
    await page.locator("#start-domain").fill("kieranbutler.com");
    await expect(page.locator("#start-domain")).toHaveValue("kieranbutler.com");
    await expect(page.locator("#start-email")).toHaveValue("starter@kieranbutler.com");
    await page.getByRole("button", { name: "Save email" }).click();

    await expect(
      page.getByRole("heading", { name: "Connect Soulink" }),
    ).toBeVisible();
    expect(mailboxPayload).toContain('"aliasLocalPart":"starter"');
    expect(providerPayload).toContain('"activeProviderId":"cloudflare-email"');
    expect(providerPayload).toContain('"fromAddress":"starter@kieranbutler.com"');
    expect(providerPayload).toContain('"sendingDomain":"kieranbutler.com"');
  });
});

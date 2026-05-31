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
        body: JSON.stringify({ ok: true, publishedAt: new Date().toISOString() }),
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

    await page.route("**/api/telegram/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          available: true,
          configured: false,
          encryptionConfigured: true,
          botUsername: null,
          botUsernameSource: "not_configured",
          tokenConfigured: false,
          botTokenSource: "not_configured",
          botTokenHint: null,
          botTokenUpdatedAt: null,
          webhookSecretConfigured: false,
          webhookSecretSource: "not_configured",
          webhookSecretHint: null,
          webhookSecretUpdatedAt: null,
          webhookUrl: null,
          startUrl: null,
          connection: null,
        }),
      });
    });
  });

  test("redirects authenticated first-time users to /start", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/start$/);
    await expect(page.getByRole("heading", { name: "Create your ME3 profile" })).toBeVisible();
  });

  test("validates profile step before allowing publish", async ({ page }) => {
    await page.goto("/start");

    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
    await page.locator("#start-name").fill("A");
    await page.locator("#start-handle").fill("ab");
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
    await expect(page.getByText("Handle must be at least 3 characters.")).toBeVisible();
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
        body: JSON.stringify({ ok: true, publishedAt: new Date().toISOString() }),
      });
    });

    await page.goto("/start");
    await page.locator("#start-name").fill("Starter User");
    await page.locator("#start-handle").fill("starter");
    await expect(page.getByText("starter is available.")).toBeVisible();

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Set up email" })).toBeVisible();
    expect(uploadBody).toContain("me.json");
    expect(uploadBody).toContain("Starter User");
    expect(uploadBody).toContain("starter");

    await page.getByRole("button", { name: "Skip for now" }).click();
    await expect(page.getByRole("heading", { name: "Connect Telegram" })).toBeVisible();

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

    await page.locator("#start-domain").fill("example.com");
    await page.locator("#start-email").fill("starter@example.com");
    await page.getByRole("button", { name: "Save email" }).click();

    await expect(page.getByRole("heading", { name: "Connect Telegram" })).toBeVisible();
    expect(mailboxPayload).toContain('"aliasLocalPart":"starter"');
    expect(providerPayload).toContain('"activeProviderId":"cloudflare-email"');
    expect(providerPayload).toContain('"fromAddress":"starter@example.com"');
  });
});

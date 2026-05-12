import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route("**/api/sites/quota", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          current: 0,
          limit: 3,
          tier: "free",
          capabilities: {
            maxSites: 3,
            customDomain: false,
            footerCustomization: false,
            emailSendQuota: 0,
            emailOverageRate: 0,
            mailboxAlias: false,
            agentInbox: false,
            approvalFirstOutbound: false,
            shopEnabled: false,
            importFromUrl: true,
            agentEnabled: false,
            telegramAgentAccess: false,
            notificationDelivery: true,
            bookingReminders: true,
          },
          can_create: true,
        }),
      });
    });

    await page.route("**/api/sites", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ sites: [] }),
        });
        return;
      }
      await route.fallback();
    });

    await page.route("**/api/usernames/*/available", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ available: true }),
      });
    });

    await page.route("**/api/stripe-connect/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "not_connected" }),
      });
    });

    await page.route("**/api/calendar/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ connected: false }),
      });
    });

    await use(page);
  },
});

export { expect };

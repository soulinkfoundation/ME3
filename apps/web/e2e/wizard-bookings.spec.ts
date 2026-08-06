import { test, expect } from "./fixtures/test";
import { WizardPage } from "./helpers/wizard";

test.describe("Wizard Bookings Step", () => {
  let wizard: WizardPage;

  test.beforeEach(async ({ page }) => {
    wizard = new WizardPage(page);

    await page.route("**/api/commerce/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          stripe: {
            configured: false,
            mode: "managed",
            connectionStatus: null,
          },
        }),
      });
    });

    await page.route("**/api/usernames/*/available", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ available: true }),
      });
    });

    await wizard.gotoStep("bookings");
  });

  test("should display bookings step", async ({ page }) => {
    await wizard.expectStepName("Bookings");
  });

  test("should show payments section with Stripe connect", async ({ page }) => {
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("button", { name: "1:1", exact: true }).click();
    await page.getByRole("button", { name: "Paid", exact: true }).click();

    await expect(
      page.getByRole("link", { name: "Connect Stripe", exact: true }),
    ).toBeVisible();
  });

  test("should allow configuring booking settings", async ({ page }) => {
    // Look for booking configuration fields
    const titleInput = page.locator('input[placeholder*="Consultation" i]').first();
    
    if ((await titleInput.count()) > 0) {
      await titleInput.fill("30-min Call");
      await page.waitForTimeout(200);
    }

    // Should be able to proceed
    await wizard.expectCanProceed(true);
  });

  test("should include Dublin and Pakistan timezone options", async ({ page }) => {
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("button", { name: "1:1", exact: true }).click();

    const timezoneSelect = page.locator(
      'select:has(option[value="Asia/Karachi"])',
    );

    await expect(timezoneSelect.locator('option[value="Europe/Dublin"]')).toHaveText(
      "Dublin (GMT/IST)",
    );
    await expect(timezoneSelect.locator('option[value="Asia/Karachi"]')).toHaveText(
      "Pakistan (PKT)",
    );
  });

  test("should allow proceeding without configuring bookings", async ({ page }) => {
    await wizard.expectCanProceed(true);
    await wizard.nextStep();

    await wizard.expectStepName("Publish");
  });
});

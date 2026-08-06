import { test, expect } from "./fixtures/test";
import { WizardPage } from "./helpers/wizard";

test.describe("Wizard Call-to-Action Step", () => {
  let wizard: WizardPage;

  test.beforeEach(async ({ page }) => {
    wizard = new WizardPage(page);

    await page.route("**/api/usernames/*/available", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ available: true }),
      });
    });

    await wizard.gotoStep("call-to-action");
  });

  test("should display call-to-action step", async ({ page }) => {
    await wizard.expectStepName("Call-to-action");
  });

  test("should allow proceeding without adding buttons", async ({ page }) => {
    await wizard.expectCanProceed(true);
    await wizard.nextStep();

    await wizard.expectStepName("Publish");
  });

  test("should allow adding buttons", async ({ page }) => {
    await page.getByRole("button", { name: "Custom", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Add a button", exact: true }),
    ).toBeVisible();
    await expect(page.locator('input[placeholder="e.g. Shop"]')).toBeVisible();

    // Should still be able to proceed
    await wizard.expectCanProceed(true);
  });
});

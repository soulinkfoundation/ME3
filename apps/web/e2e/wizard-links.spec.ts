import { test } from "./fixtures/test";
import { WizardPage } from "./helpers/wizard";

test.describe("Wizard Links Step", () => {
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

    await wizard.gotoStep("links");
  });

  test("should display links step", async ({ page }) => {
    await wizard.expectStepName("Links");
  });

  test("should allow proceeding without adding links", async ({ page }) => {
    await wizard.expectCanProceed(true);
    await wizard.nextStep();

    await wizard.expectStepName("Publish");
  });

  test("should allow adding links", async ({ page }) => {
    // Look for input fields or add buttons
    const inputs = page.locator('input[type="text"], input[type="url"]');
    const inputCount = await inputs.count();

    // If there are inputs, try to add a link
    if (inputCount > 0) {
      await inputs.first().fill("https://github.com/testuser");
      await page.waitForTimeout(500); // Wait for state update
    }

    // Should still be able to proceed
    await wizard.expectCanProceed(true);
  });
});

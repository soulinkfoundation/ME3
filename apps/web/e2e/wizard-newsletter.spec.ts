import { test } from "./fixtures/test";
import { WizardPage } from "./helpers/wizard";

test.describe("Wizard Newsletter Step", () => {
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

    await wizard.gotoStep("newsletter");
  });

  test("should display newsletter step", async ({ page }) => {
    await wizard.expectStepName("Newsletter");
  });

  test("should allow configuring newsletter settings", async ({ page }) => {
    // Look for newsletter configuration fields
    const titleInput = page.locator('input[placeholder*="Weekly" i]').first();
    
    if ((await titleInput.count()) > 0) {
      await titleInput.fill("My Newsletter");
      await page.waitForTimeout(200);
    }

    // Should be able to proceed
    await wizard.expectCanProceed(true);
  });

  test("should allow proceeding without configuring newsletter", async ({ page }) => {
    await wizard.expectCanProceed(true);
    await wizard.nextStep();

    await wizard.expectStepName("Publish");
  });
});

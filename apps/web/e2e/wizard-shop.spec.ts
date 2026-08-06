import { test } from "./fixtures/test";
import { WizardPage } from "./helpers/wizard";

test.describe("Wizard Shop Step", () => {
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

    await wizard.gotoStep("products");
  });

  test("should display products step when enabled", async ({ page }) => {
    await wizard.expectStepName("Products");
  });

  test("should allow proceeding without adding products", async ({ page }) => {
    await wizard.expectCanProceed(true);
  });
});

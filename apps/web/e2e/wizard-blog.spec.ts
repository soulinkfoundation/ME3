import { test } from "./fixtures/test";
import { WizardPage } from "./helpers/wizard";

test.describe("Wizard Blog Step", () => {
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

    await wizard.gotoStep("blog");
  });

  test("should display blog step when enabled", async ({ page }) => {
    await wizard.expectStepName("Blog");
  });

  test("should allow proceeding without adding posts", async ({ page }) => {
    await wizard.expectCanProceed(true);
  });
});

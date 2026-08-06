import { test, expect } from "./fixtures/test";
import { WizardPage } from "./helpers/wizard";

test.describe("Wizard Additional Features Step", () => {
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

    await wizard.gotoStep("additional-features");
  });

  test("should display additional features step", async ({ page }) => {
    await wizard.expectStepName("Additional Features");
  });

  test("should display feature cards", async ({ page }) => {
    for (const feature of [
      "Links",
      "Call-to-action",
      "Pages",
      "Newsletter",
      "Bookings",
      "Blog",
      "Products",
      "Testimonials",
    ]) {
      await expect(
        page.locator(".feature-card .feature-name", { hasText: feature }),
      ).toBeVisible();
    }
  });

  test("should allow proceeding without enabling features", async ({ page }) => {
    await wizard.expectCanProceed(true);
    await wizard.nextStep();

    // Should go to Publish (no conditional steps enabled)
    await wizard.expectStepName("Publish");
  });

  test("should allow toggling blog feature", async ({ page }) => {
    // Find and click the Blog toggle
    const blogToggle = page.locator(
      '.feature-card:has(.feature-name:has-text("Blog")) .feature-toggle',
    );

    await blogToggle.click();
    await expect(blogToggle.locator('input[type="checkbox"]')).toBeChecked();
  });

  test("should proceed to conditional steps when enabled", async ({ page }) => {
    // Enable blog
    const blogToggle = page.locator(
      '.feature-card:has(.feature-name:has-text("Blog")) .feature-toggle',
    );

    await blogToggle.click();
    await expect(blogToggle.locator('input[type="checkbox"]')).toBeChecked();

    await wizard.nextStep();
    await wizard.expectStepName("Blog");
  });
});

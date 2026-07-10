import { test, expect } from "./fixtures/test";
import { WizardPage } from "./helpers/wizard";

test.describe("Wizard Full Flow", () => {
  let wizard: WizardPage;

  test.beforeEach(async ({ page }) => {
    wizard = new WizardPage(page);

    // Mock all API endpoints
    await page.route("**/api/usernames/*/available", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ available: true }),
      });
    });

    await page.route("**/api/sites/*", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ success: true }),
        });
      }
    });
  });

  test("should complete full wizard journey from start to publish", async ({
    page,
  }) => {
    await wizard.goto();

    // Step 1: Basics
    await wizard.expectStepName("Basics");
    await wizard.fillBasics(
      "John Doe",
      "johndoe",
      "Software engineer and designer",
    );
    await wizard.waitForUsernameCheck();
    await wizard.expectCanProceed(true);
    await wizard.nextStep();

    // Step 2: Avatar (skip for now)
    await wizard.expectStepName("Avatar");
    await wizard.nextStep();

    // Step 3: Banner (skip for now)
    await wizard.expectStepName("Banner");
    await wizard.nextStep();

    // Step 4: Links
    await wizard.expectStepName("Links");
    // Add a link if there's an input visible
    const linkInputs = page.locator('input[type="text"], input[type="url"]');
    if ((await linkInputs.count()) > 0) {
      await linkInputs.first().fill("https://github.com/johndoe");
    }
    await wizard.nextStep();

    // Step 5: Call-to-action
    await wizard.expectStepName("Call-to-action");
    await wizard.nextStep();

    // Step 6: Pages
    await wizard.expectStepName("Pages");
    await wizard.nextStep();

    // Step 7: Additional Features
    await wizard.expectStepName("Additional Features");
    await wizard.nextStep();

    // Step 8: Offerings
    await wizard.expectStepName("Offerings");
    await wizard.nextStep();

    // Final step: Publish
    await wizard.expectStepName("Publish");

    // Verify we're on the publish step
    const currentStep = await wizard.getCurrentStep();
    const totalSteps = await page.locator(".step-total").textContent();
    expect(currentStep).toBe(totalSteps);

    // Verify preview is visible (use first() to handle multiple matches)
    await expect(page.locator(".publish-preview")).toBeVisible();
  });

  test("should update preview in real-time", async ({ page }) => {
    await wizard.goto();

    // Fill basics
    await wizard.fillBasics(
      "Preview Test",
      "previewtest",
      "Testing preview updates",
    );
    await wizard.waitForUsernameCheck();

    // Check that preview shows the name
    await expect(page.locator("body")).toContainText("Preview Test", {
      timeout: 2000,
    });

    // Navigate through steps and verify preview updates
    await wizard.nextStep();
    await wizard.nextStep();
    await wizard.nextStep();

    // Preview should still be visible (use first() to handle multiple matches)
    await expect(page.locator(".preview-panel").first()).toBeVisible();
  });

  test("should allow navigation back and forth", async ({ page }) => {
    await wizard.goto();

    // Fill basics and go forward
    await wizard.fillBasics("Nav Test", "navtest", "Navigation test");
    await wizard.waitForUsernameCheck();
    await wizard.nextStep();
    await wizard.nextStep();

    // Go back
    await wizard.prevStep();
    await wizard.expectStepName("Avatar");

    await wizard.prevStep();
    await wizard.expectStepName("Basics");

    // Data should still be there
    const nameValue = await page.locator("#name").inputValue();
    expect(nameValue).toBe("Nav Test");
  });

  test("should jump between visited steps from the progress shortcut row", async () => {
    await wizard.goto();

    await wizard.fillBasics("Shortcut Test", "shortcuttest", "Shortcut test");
    await wizard.waitForUsernameCheck();
    await wizard.nextStep();
    await wizard.nextStep();

    await wizard.expectStepShortcutEnabled("Basics", true);
    await wizard.expectStepShortcutEnabled("Avatar", true);
    await wizard.expectStepShortcutEnabled("Banner", true);
    await wizard.expectStepShortcutEnabled("Links", false);

    await wizard.clickStepShortcut("Basics");
    await wizard.expectStepName("Basics");

    await wizard.clickStepShortcut("Banner");
    await wizard.expectStepName("Banner");
  });

  test("should handle optional features (blog/shop)", async ({ page }) => {
    await wizard.goto();

    // Go through required steps
    await wizard.fillBasics("Feature Test", "featuretest", "Testing features");
    await wizard.waitForUsernameCheck();

    // Navigate through all required steps
    for (let i = 0; i < 5; i++) {
      await wizard.nextStep();
      await page.waitForTimeout(300);
    }

    // Should be on Pages step (before optional blog/shop)
    await wizard.expectStepName("Pages");

    // Continue to publish (blog/shop disabled by default)
    await wizard.nextStep();
    await wizard.expectStepName("Additional Features");
    await wizard.nextStep();
    await wizard.expectStepName("Offerings");
    await wizard.nextStep();
    await wizard.expectStepName("Publish");
  });

  test("should show correct step numbers and progress", async ({ page }) => {
    await wizard.goto();

    // Check initial step
    const step1 = await wizard.getCurrentStep();
    expect(step1).toBe("1");

    // Navigate forward
    await wizard.fillBasics("Progress Test", "progresstest", "Progress");
    await wizard.waitForUsernameCheck();
    await wizard.nextStep();

    const step2 = await wizard.getCurrentStep();
    expect(step2).toBe("2");

    // Check progress bar exists
    await expect(page.locator(".progress-bar")).toBeVisible();
    await expect(page.locator(".progress-fill")).toBeVisible();
  });

  test("should handle exit and return", async ({ page }) => {
    await wizard.goto();

    // Fill some data
    await wizard.fillBasics("Exit Test", "exittest", "Exit test");
    await wizard.waitForUsernameCheck();
    await wizard.nextStep();

    // Click exit (but cancel)
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.click(".exit-btn");

    // Should still be on wizard
    await wizard.expectStepName("Avatar");

    // Actually exit
    page.once("dialog", (dialog) => dialog.accept());
    await page.click(".exit-btn");

    // The mocked site list is empty, so the site route resolves to setup.
    await page.waitForURL(/\/(?:start|calendar)(?:\/|\?|$)/, { timeout: 3000 });
  });
});

import { expect, test } from "@playwright/test";
import { waitForSettingsSaved } from "../utils/settingsHelpers";

test.use({ storageState: "tests/e2e/.auth/user.json" });

test.describe("Settings - User preferences", () => {
  test.beforeEach(async ({ page }) => {
    try {
      await page.goto("/settings/preferences");
      await page.waitForLoadState("networkidle");
    } catch (error) {
      console.log("Initial navigation failed, retrying...", error);
      await page.goto("/settings/preferences");
      await page.waitForLoadState("domcontentloaded");
    }
  });

  test("should allow toggling auto-assign on/off reply setting", async ({ page }) => {
    const autoAssignSetting = page.locator('section:has(h2:text("Auto-assign on reply"))');
    const autoAssignSwitch = page.locator('[aria-label="Auto-assign on reply Switch"]');

    await expect(autoAssignSetting).toBeVisible();

    const isEnabled = await autoAssignSwitch.isChecked();

    await autoAssignSwitch.click();
    await waitForSettingsSaved(page);
    await expect(autoAssignSwitch).toBeChecked({ checked: !isEnabled });

    await autoAssignSwitch.click();
    await waitForSettingsSaved(page);
    await expect(autoAssignSwitch).toBeChecked({ checked: isEnabled });
  });
});

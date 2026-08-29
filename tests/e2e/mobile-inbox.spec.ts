import { expect, test } from "@playwright/test";

test.describe("C16 mobile Inbox and receipt journey", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("operator can inspect attention, intervene in a run, and open its receipt", async ({ page }) => {
    await page.goto("/inbox?workspace=ws-demo&filter=attention");
    await expect(page.getByRole("heading", { name: "Human attention queue" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link")).toHaveCount(5);
    await expect(page.getByRole("link", { name: "Open Run" }).first()).toBeVisible();
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
    await page.getByRole("tab", { name: "Approvals" }).click();
    await expect(page).toHaveURL(/tab=approvals/);
    await expect(page.getByLabel("Inbox items").getByRole("heading", { name: "R3 publish review" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("tab", { name: "Approvals" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Run needs operator attention", { exact: true })).toHaveCount(0);
    await page.getByRole("tab", { name: "Approvals" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Failures" })).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/tab=failures/);
    await expect(page.getByLabel("Inbox items").getByRole("heading", { name: "Run needs operator attention" })).toBeVisible();
    await page.keyboard.press("Home");
    await expect(page.getByRole("tab", { name: "Attention" })).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/tab=attention/);
    await page.getByRole("tab", { name: "Failures" }).click();
    await expect(page.getByLabel("Inbox items").getByRole("heading", { name: "Run needs operator attention" })).toBeVisible();
    await expect(page.getByText("R3 publish review", { exact: true })).toHaveCount(0);
    await page.getByRole("tab", { name: "Attention" }).click();

    await page.getByRole("link", { name: "Open Run" }).nth(1).click();
    await expect(page.getByRole("heading", { name: "Run Detail" })).toBeVisible();
    await page.getByRole("button", { name: "Pause run" }).click();
    await expect(page.getByText("Recovery action selected: Pause run.", { exact: false })).toBeVisible();
    await page.getByRole("link", { name: /Receipt rcp-run-active-02/ }).click();
    await expect(page.getByRole("heading", { name: "Run Detail" })).toBeVisible();
    await expect(page.url()).toContain("tab=receipt");
  });
});

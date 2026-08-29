import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("C16 accessibility and responsive smoke", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("has a keyboard skip path, named navigation, no horizontal overflow, and no axe violations", async ({ page }) => {
    await page.goto("/mission-control?workspace=ws-demo");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.keyboard.press("Tab");
    await expect(page.locator(".skip-link")).toBeFocused();
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link")).toHaveCount(5);
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);

    const interactiveSizes = await page.locator("a, button, input, select, textarea").evaluateAll((elements) => elements.flatMap((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return [];
      return [{ height: rect.height, width: rect.width, label: element.textContent?.trim() ?? element.getAttribute("aria-label") ?? element.tagName }];
    }));
    expect(interactiveSizes.every(({ height, width }) => height >= 44 && width >= 44)).toBe(true);

    const reducedMotion = await page.locator("body").evaluate((body) => getComputedStyle(body).animationDuration);
    expect(["0.01ms", "1e-05s"]).toContain(reducedMotion);
    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toEqual([]);
  });
});

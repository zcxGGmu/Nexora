import { expect, test } from "@playwright/test";

test.describe("C12 SEO draft workflow", () => {
  test("Operator starts from workflow and reaches pending review without publish side effects", async ({ page }) => {
    await page.goto("/workflows/seo_draft_v1?workspace=ws-demo&tab=stations");
    await expect(page.getByRole("heading", { name: "Workflow Studio" })).toBeVisible();
    await expect(page.getByText("publish disabled")).toBeVisible();
    await page.getByRole("link", { name: "Start SEO draft run" }).click();

    await expect(page.getByRole("heading", { name: "SEO Draft Run" })).toBeVisible();
    await expect(page.getByText("waiting_review")).toBeVisible();
    await expect(page.getByText("No publish or indexing call executed")).toBeVisible();
    await expect(page.getByText("Judge pass")).toBeVisible();
    await page.getByRole("link", { name: "Open Review" }).click();

    await expect(page.getByRole("heading", { name: "Review Center" })).toBeVisible();
    await expect(page.getByText("Risk R2")).toBeVisible();
  });
});

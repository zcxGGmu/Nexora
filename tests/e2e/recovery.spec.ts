import { expect, test } from "@playwright/test";

test.describe("C16 recovery and deep-link journey", () => {
  test("preserves safe recovery actions and does not repeat a command on refresh", async ({ page }) => {
    await page.goto("/runs/run-active?workspace=ws-demo&tab=events&cursor=evt-2");
    await expect(page.getByRole("heading", { name: "Run Detail" })).toBeVisible();
    await page.getByRole("button", { name: "Pause run" }).click();
    await page.getByRole("button", { name: "Stop run" }).click();
    await page.getByRole("button", { name: "Retry failed step" }).click();
    await expect(page.getByText("Recovery action selected: Retry failed step. Retry creates a new attempt. Completed side effects remain recorded.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/tab=events&cursor=evt-2/);
    await expect(page.getByText("Recovery action selected:", { exact: false })).toHaveCount(0);

    await page.goto("/review/rev-stale?workspace=ws-demo&tab=evidence");
    await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled();
    await page.getByLabel("Decision reason").fill("Payload changed; reconcile before approval.");
    await page.getByRole("button", { name: "Reject" }).click();
    await expect(page.getByText("Decision recorded: Reject for rev-stale", { exact: false })).toBeVisible();
  });
});

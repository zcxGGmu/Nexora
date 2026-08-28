import { expect, test } from "@playwright/test";

test.describe("C11 Operator and Reviewer workspaces", () => {
  test("Operator can deep-link from goal to run and artifact without starting duplicate commands", async ({ page }) => {
    await page.goto("/mission-control?workspace=ws-demo");
    await page.getByRole("link", { name: "Open Run" }).click();
    await expect(page.getByRole("heading", { name: "Run Detail" })).toBeVisible();
    await expect(page.getByText("run-blocked", { exact: true })).toBeVisible();

    await page.goto("/goals?workspace=ws-demo&filter=running");
    await expect(page.getByRole("heading", { name: "Goal Portfolio" })).toBeVisible();
    await expect(page.getByText("Drag updates planning only", { exact: true })).toBeVisible();
    await page.getByLabel("Change ticket status").first().selectOption("Review");
    await expect(page.getByText("Planned status Review")).toBeVisible();
    await expect(page.getByText("Status change queued as planning update only; no Agent started.")).toHaveCount(2);

    await page.goto("/runs/run-active?workspace=ws-demo&tab=events&cursor=evt-2");
    await expect(page.getByRole("heading", { name: "Run Detail" })).toBeVisible();
    await expect(page.getByText("Completed side effects remain recorded.", { exact: true })).toHaveCount(2);
    await page.getByRole("button", { name: "Pause run" }).click();
    await expect(page.getByText("Recovery action selected: Pause run. Completed side effects remain recorded.")).toBeVisible();
    await page.getByRole("button", { name: "Stop run" }).click();
    await expect(page.getByText("Recovery action selected: Stop run. Completed side effects remain recorded.")).toBeVisible();
    await page.getByRole("button", { name: "Retry failed step" }).click();
    await expect(page.getByText("Recovery action selected: Retry failed step. Retry creates a new attempt. Completed side effects remain recorded.")).toBeVisible();

    await page.goto("/artifacts/artifact-summary?workspace=ws-demo&tab=receipt");
    await expect(page.getByRole("heading", { name: "Artifact Workspace" })).toBeVisible();
    await expect(page.getByText("Editing creates a new artifact version")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Receipt" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: "Receipt" })).toContainText("Receipt rcp-artifact-v1 verifies evidence-summary.md v1.");
    await page.getByRole("tab", { name: "Diff" }).click();
    await expect(page.getByRole("tabpanel", { name: "Diff" })).toContainText("Diff compares v1 with the previous version");
    await page.getByRole("tab", { name: "Source" }).click();
    await expect(page.getByRole("tabpanel", { name: "Source" })).toContainText("Source Run run-active created receipt rcp-artifact-v1");
    await page.goto("/artifacts/artifact-missing?workspace=ws-demo");
    await expect(page.getByRole("heading", { name: "Artifact not found" })).toBeVisible();
    await expect(page.getByText("No C11 fixture exists for Artifact artifact-missing.")).toBeVisible();

    await page.reload();
    await expect(page.getByText("No C11 fixture exists for Artifact artifact-missing.")).toBeVisible();
  });

  test("Reviewer records reasoned decisions and sees stale approval blocked before deciding", async ({ page }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await page.goto("/mission-control?workspace=ws-demo");
    await page.locator(".context-rail").getByRole("link", { name: "Open Review" }).click();
    await expect(page.getByRole("heading", { name: "Review Center" })).toBeVisible();
    await expect(page.getByText("Risk R3")).toBeVisible();

    await page.goto("/review/rev-r2?workspace=ws-demo&tab=evidence");
    await expect(page.getByRole("heading", { name: "Review Center" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled();
    await page.getByLabel("Decision reason").fill("Evidence receipts match the requested SEO draft.");
    await page.getByLabel("Confirm exact payload hash").fill("sha256:7f4a6d15c0e2");
    await expect(page.getByRole("button", { name: "Approve" })).toBeEnabled();
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("Decision recorded: Approve for rev-r2; no external side effect executed.")).toBeVisible();
    await page.getByRole("button", { name: "Request changes" }).click();
    await expect(page.getByText("Decision recorded: Request changes for rev-r2; no external side effect executed.")).toBeVisible();

    await page.goto("/review/rev-stale?workspace=ws-demo&tab=evidence");
    await expect(page.getByRole("heading", { name: "Review Center" })).toBeVisible();
    await expect(page.getByText("Payload Diff")).toBeVisible();
    await expect(page.getByText("Source Receipts")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled();
    await page.getByLabel("Decision reason").fill("Evidence is stale and needs refresh before approval.");
    await page.getByRole("button", { name: "Reject" }).click();
    await expect(page.getByText("Decision recorded: Reject for rev-stale; no external side effect executed.")).toBeVisible();

    await page.goto("/runs/run-missing?workspace=ws-demo");
    await expect(page.getByRole("heading", { name: "Run not found" })).toBeVisible();
    await expect(page.getByText("No C11 fixture exists for Run run-missing.")).toBeVisible();
    await page.goto("/review/rev-missing?workspace=ws-demo");
    await expect(page.getByRole("heading", { name: "Review not found" })).toBeVisible();
    await expect(page.getByText("No C11 fixture exists for Review rev-missing.")).toBeVisible();
  });
});

// E2E 11 — Sharing a post link (issue #46).
import { expect, test } from "@playwright/test";
import { isolateClient, openPost } from "../support";

isolateClient(11);
const POST = "Орталықтағы қолдау ерекше ұнайды";

test.describe("#46 sharing", () => {
  test("anyone copies a post link and the link opens the same post", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    // Headless Chrome exposes navigator.share without a picker: force the copy path.
    await page.addInitScript(() => Object.defineProperty(navigator, "share", { value: undefined }));
    const detail = await openPost(page, POST);
    await detail.getByRole("button", { name: "Бөлісу" }).click();
    await expect(page.getByText("Сілтеме көшірілді.").first()).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain("?post=");

    const fresh = await context.newPage();
    await fresh.goto(link);
    await expect(fresh.getByRole("dialog").getByRole("heading", { level: 1, name: POST })).toBeVisible();
  });
});

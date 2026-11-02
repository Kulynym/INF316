// E2E 09 — Discussion comments (issue #44).
import { expect, test } from "@playwright/test";
import { ACCOUNTS, isolateClient, loginAs, openPost, unique } from "../support";

isolateClient(9);
const POST = "Тақырыптық конспектілерді PDF форматында қоссақ";

test.describe("#44 discussion", () => {
  test("a signed-in user joins the discussion under a post", async ({ page }) => {
    const text = unique("E2E талқылау пікірі");
    await page.goto("/");
    await loginAs(page, ACCOUNTS.user);
    const detail = await openPost(page, POST);
    await detail.getByRole("textbox", { name: "Пікіріңіз" }).fill(text);
    await detail.getByRole("button", { name: "Жіберу" }).click();
    await expect(detail.getByText(text)).toBeVisible();
    // Persisted: visible after a fresh load.
    const again = await openPost(page, POST);
    await expect(again.getByText(text)).toBeVisible();
  });

  test("a guest is asked to sign in instead of commenting", async ({ page }) => {
    await page.goto("/");
    const detail = await openPost(page, POST);
    await expect(detail.getByRole("textbox", { name: "Пікіріңіз" })).toHaveCount(0);
    await detail.getByRole("button", { name: "Талқылауға қосылу үшін кіру" }).click();
    await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
  });
});

// E2E 10 — Support and bookmarks / saved posts (issue #45).
import { expect, test } from "@playwright/test";
import { ACCOUNTS, isolateClient, loginAs, openSection, searchFeed } from "../support";

isolateClient(10);
const POST = "Телефоннан тапсырма файлын аша алмадым";

test.describe("#45 support and bookmarks", () => {
  test("a signed-in user supports and saves a post, then removes it from saved", async ({ page }) => {
    await page.goto("/");
    await loginAs(page, ACCOUNTS.boss);
    await searchFeed(page, POST);
    const card = page.getByRole("article").filter({ hasText: POST });
    const support = card.getByRole("button", { name: /^Қолдау: \d+/ });
    const before = Number((await support.getAttribute("aria-label"))!.match(/\d+/)![0]);
    await support.click();
    await expect(support).toHaveAttribute("aria-label", new RegExp(`Қолдау: (${before + 1}|${before - 1})`));

    await card.getByRole("button", { name: "Сақтау" }).click();
    await openSection(page, "Сақталғандар");
    await expect(page.getByRole("article").filter({ hasText: POST })).toHaveCount(1);
    await page.getByRole("article").filter({ hasText: POST }).getByRole("button", { name: "Сақтау" }).click();
    await expect(page.getByRole("heading", { name: "Сақталған жазба жоқ" })).toBeVisible();

    // Undo the support so reruns start from the same state.
    await searchFeed(page, POST);
    await card.getByRole("button", { name: /^Қолдау: \d+/ }).click();
    await expect(card.getByRole("button", { name: /^Қолдау: \d+/ })).toHaveAttribute("aria-label", `Қолдау: ${before}`);
  });

  test("a guest who tries to support is asked to sign in", async ({ page }) => {
    await searchFeed(page, POST);
    await page.getByRole("article").filter({ hasText: POST }).getByRole("button", { name: /^Қолдау: \d+/ }).click();
    await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
  });
});

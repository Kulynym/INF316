// E2E 01 — Public feed: browse, search and filters (issue #36).
import { expect, test } from "@playwright/test";
import { isolateClient } from "../support";

isolateClient(1);

test.describe("#36 public feed", () => {
  test("a visitor browses, searches, filters by type and resets", async ({ page }) => {
    await page.goto("/");
    const counter = page.getByRole("status").filter({ hasText: /жазба/ });
    await expect(page.getByRole("article").first()).toBeVisible();
    const total = Number((await counter.innerText()).match(/\d+/)![0]);
    expect(total).toBeGreaterThan(0);

    // Type tabs narrow the list to that type only.
    await page.getByRole("button", { name: /^Мәселе \d+/ }).click();
    const issues = page.getByRole("article");
    await expect(issues.first()).toBeVisible();
    for (const text of await issues.allInnerTexts()) expect(text).toContain("Мәселе");

    // Text search finds a seeded post by its title.
    await page.getByRole("button", { name: /^Барлығы \d+/ }).click();
    const search = page.getByRole("textbox", { name: "Жазбалардан іздеу" });
    await search.fill("Математиканы түсіну");
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Математиканы түсіну әлдеқайда жеңіл болды" })).toBeVisible();

    // A search without matches shows the empty state, clearing restores all.
    await search.fill("мұндай мәтін жоқ zzqx");
    await expect(page.getByRole("heading", { name: "Жазба табылмады" })).toBeVisible();
    await page.getByRole("button", { name: "Іздеуді тазарту" }).click();
    await expect(counter).toHaveText(new RegExp(`${total} жазба`));
  });

  test("status filter narrows posts and the filter reset restores the feed", async ({ page }) => {
    await page.goto("/");
    const counter = page.getByRole("status").filter({ hasText: /жазба/ });
    await expect(page.getByRole("article").first()).toBeVisible();
    const before = await counter.innerText();
    await page.getByRole("button", { name: "Сүзгілер" }).click();
    await page.getByRole("combobox", { name: "Мәртебе бойынша сүзгі" }).selectOption("resolved");
    for (const text of await page.getByRole("article").allInnerTexts()) expect(text).toContain("Шешілді");
    await page.getByRole("button", { name: /Сүзгілерді тазарту|Тазарту/ }).first().click();
    await expect(counter).toHaveText(before);
  });
});

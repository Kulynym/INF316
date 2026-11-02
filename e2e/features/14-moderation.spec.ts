// E2E 14 — Moderation: reports, hiding and audit log (issue #49).
import { expect, test } from "@playwright/test";
import { ACCOUNTS, acknowledge, isolateClient, loginAs, logout, openPost, openSection, publish, searchFeed, unique } from "../support";

isolateClient(14);

test.describe("#49 moderation", () => {
  test("a report reaches the dashboard; hiding removes the post publicly and is logged", async ({ page }) => {
    const title = unique("Модерация сынағы");
    await page.goto("/");
    const { number, receipt } = await publish(page, { type: "Пікір", title, anonymous: true });
    await acknowledge(receipt);

    // A visitor reports the post.
    let detail = await openPost(page, title);
    await detail.getByRole("button", { name: "Шағым беру" }).click();
    const report = page.locator("form").filter({ has: page.getByRole("radiogroup") });
    await report.getByText("Спам").click();
    await report.getByPlaceholder("Не болғанын жазыңыз").fill("E2E: жарнама мазмұны.");
    await report.getByRole("button", { name: "Жіберу" }).click();
    await expect(page.getByText("Шағым жіберілді").first()).toBeVisible();

    // The manager finds it in the reports tab and hides the post with a reason.
    await page.goto("/");
    await loginAs(page, ACCOUNTS.boss);
    await openSection(page, "Модерация");
    await page.getByRole("button", { name: /^Шағымдар( \d+)?$/ }).click();
    await expect(page.locator(".report-row", { hasText: title }).first()).toBeVisible();
    detail = await openPost(page, title);
    await detail.getByRole("button", { name: "Модерация" }).click();
    await detail.getByRole("textbox", { name: "Жасыру себебі" }).fill("E2E: спам");
    await detail.getByRole("button", { name: "Жасыру", exact: true }).click();
    await page.keyboard.press("Escape");

    await openSection(page, "Модерация");
    await page.getByRole("button", { name: /^Тарих( \d+)?$/ }).click();
    await expect(page.locator(".log-row", { hasText: `№${number}` }).filter({ hasText: "Жазбаны жасырды" }).first()).toBeVisible();

    // The public no longer sees it.
    await logout(page);
    await searchFeed(page, title);
    await expect(page.getByRole("heading", { name: "Жазба табылмады" })).toBeVisible();
  });

  test("teachers and users never see the moderation dashboard", async ({ page }) => {
    await page.goto("/");
    await loginAs(page, ACCOUNTS.teacher);
    await expect(page.getByRole("navigation").getByRole("button", { name: /^Модерация/ })).toHaveCount(0);
  });
});

// E2E 02 — Guest feedback submission with receipt code (issue #37).
import { expect, test } from "@playwright/test";
import { acknowledge, isolateClient, publish, searchFeed, unique } from "../support";

isolateClient(2);

test.describe("#37 guest submission", () => {
  test("a guest publishes feedback and receives a one-time receipt", async ({ page }) => {
    const title = unique("Қонақ ұсынысы");
    await page.goto("/");
    const { number, code, receipt } = await publish(page, {
      type: "Ұсыныс",
      title,
      anonymous: false,
      authorName: "E2E Қонақ",
    });
    expect(Number(number)).toBeGreaterThan(1000);
    expect(code.length).toBeGreaterThanOrEqual(8);
    await acknowledge(receipt);

    // Published immediately: the post opens and is in the public feed.
    const detail = page.getByRole("dialog", { name: `Өтініш №${number}` });
    await expect(detail.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(detail.getByText("E2E Қонақ")).toBeVisible();
    await searchFeed(page, title);
    await expect(page.getByRole("article").filter({ hasText: title })).toHaveCount(1);
  });

  test("invalid input is rejected and the typed text is kept", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Жазба қалдыру" }).first().click();
    const composer = page.getByRole("dialog", { name: "Кері байланыс қалдыру" });
    await composer.getByRole("textbox", { name: "Тақырып", exact: true }).fill("аб");
    await composer.getByRole("textbox", { name: "Мәтін", exact: true }).fill("т");
    await composer.getByRole("button", { name: "Жариялау" }).click();
    await expect(page.getByRole("dialog", { name: "Жазбаңыз жарияланды" })).toHaveCount(0);
    await expect(composer.getByRole("textbox", { name: "Тақырып", exact: true })).toHaveValue("аб");
  });
});

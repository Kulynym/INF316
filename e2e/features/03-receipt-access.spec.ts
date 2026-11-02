// E2E 03 — Receipt access: open own post with number and code (issue #38).
import { expect, test } from "@playwright/test";
import { acknowledge, isolateClient, otherPerson, publish, unique } from "../support";

isolateClient(3);

test.describe("#38 receipt access", () => {
  test("the receipt reopens the post on another device; a wrong code is denied", async ({ page, browser }) => {
    const title = unique("Кодпен ашу");
    await page.goto("/");
    const { number, code, receipt } = await publish(page, { type: "Мәселе", title, anonymous: true });
    await acknowledge(receipt);

    const device = await otherPerson(browser, 3);
    const other = device.page;
    await other.getByRole("button", { name: "Өтінішті табу" }).click();
    const finder = other.getByRole("dialog");
    await finder.getByRole("textbox", { name: "Өтініш нөмірі" }).or(finder.locator('input[name="number"]')).first().fill(number);
    await finder.locator('input[name="code"]').fill("WRONG-CODE-123");
    await finder.locator('button[type="submit"]').click();
    await expect(other.locator(".error, [role=alert]").filter({ hasText: /./ }).first()).toBeVisible();
    await expect(other.getByRole("dialog", { name: `Өтініш №${number}` })).toHaveCount(0);

    await finder.locator('input[name="number"]').fill(number);
    await finder.locator('input[name="code"]').fill(code);
    await finder.locator('button[type="submit"]').click();
    const detail = other.getByRole("dialog", { name: `Өтініш №${number}` });
    await expect(detail.getByRole("heading", { level: 1, name: title })).toBeVisible();
    // Ownership through the code: the author controls are available.
    await expect(detail.getByRole("button", { name: "Өзгерту", exact: true })).toBeVisible();
    await device.context.close();
  });
});

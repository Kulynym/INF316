// E2E 17 — Notifications (issue #52).
import { expect, test } from "@playwright/test";
import { ACCOUNTS, acknowledge, isolateClient, loginAs, logout, openPost, openSection, publish, unique } from "../support";

isolateClient(17);

test.describe("#52 notifications", () => {
  test("the author is notified about an official reply and opens the post from it", async ({ page }) => {
    const title = unique("Хабарлама сынағы");
    await page.goto("/");
    await loginAs(page, ACCOUNTS.user);
    const { receipt } = await publish(page, { type: "Ұсыныс", title, anonymous: false });
    await acknowledge(receipt);
    await logout(page);

    await loginAs(page, ACCOUNTS.boss);
    const managed = await openPost(page, title);
    await managed.getByRole("textbox", { name: "Жауап мәтіні" }).fill("E2E: ұсынысыңыз қаралды.");
    await managed.getByRole("button", { name: "Жауапты жариялау" }).click();
    await expect(managed.getByText("E2E: ұсынысыңыз қаралды.")).toBeVisible();
    await page.keyboard.press("Escape");
    await logout(page);

    await loginAs(page, ACCOUNTS.user);
    await expect(page.getByRole("button", { name: /Хабарламалар: \d+ оқылмаған/ })).toBeVisible();
    await page.getByRole("button", { name: /Хабарламалар: \d+ оқылмаған/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Хабарламалар" })).toBeVisible();
    await page.getByRole("button", { name: /Өтінішіңізге ресми жауап берілді/ }).first().click();
    await expect(page.getByRole("dialog").getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("guests are sent to sign in when opening notifications", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Хабарламалар" }).click();
    await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
  });
});

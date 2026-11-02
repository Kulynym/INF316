// E2E 07 — Author edits and deletes own post (issue #42).
import { expect, test } from "@playwright/test";
import { ACCOUNTS, acknowledge, isolateClient, loginAs, openPost, publish, searchFeed, unique } from "../support";

isolateClient(7);

test.describe("#42 author edit and delete", () => {
  test("a signed-in author edits the post, then deletes it", async ({ page }) => {
    const title = unique("Өңделетін жазба");
    const edited = `${title} (жаңартылды)`;
    await page.goto("/");
    await loginAs(page, ACCOUNTS.user);
    const { receipt } = await publish(page, { type: "Пікір", title, anonymous: false });
    await acknowledge(receipt);

    let detail = await openPost(page, title);
    await detail.getByRole("button", { name: "Өзгерту", exact: true }).click();
    await detail.getByRole("textbox", { name: "Тақырып", exact: true }).fill(edited);
    await detail.getByRole("button", { name: "Өзгерісті сақтау" }).click();
    await expect(detail.getByRole("heading", { level: 1, name: edited })).toBeVisible();
    await expect(detail.getByText("өзгертілген")).toBeVisible();

    detail = await openPost(page, edited);
    await detail.getByRole("button", { name: "Жазбаны өшіру" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Өшіру", exact: true }).click();
    // Wait for the delete to finish (the post dialog closes) before reloading.
    await expect(page.getByRole("dialog", { name: /Өтініш №/ })).toHaveCount(0);
    await searchFeed(page, edited);
    await expect(page.getByRole("heading", { name: "Жазба табылмады" })).toBeVisible();
  });

  test("other users cannot edit someone else's post", async ({ page }) => {
    await page.goto("/");
    await loginAs(page, ACCOUNTS.user);
    const detail = await openPost(page, "Тақырыптық конспектілерді PDF форматында қоссақ");
    await expect(detail.getByRole("button", { name: "Өзгерту", exact: true })).toHaveCount(0);
    await expect(detail.getByRole("button", { name: "Жазбаны өшіру" })).toHaveCount(0);
  });
});

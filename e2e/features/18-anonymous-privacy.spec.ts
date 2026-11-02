// E2E 18 — Anonymous author privacy (issue #53).
import { expect, test } from "@playwright/test";
import { ACCOUNTS, acknowledge, isolateClient, loginAs, logout, openPost, publish, unique } from "../support";

isolateClient(18);

test.describe("#53 anonymous privacy", () => {
  test("an anonymous post by a signed-in user never reveals the author, even to leadership", async ({ page }) => {
    const title = unique("Анонимді жазба");
    await page.goto("/");
    await loginAs(page, ACCOUNTS.user);
    const { receipt } = await publish(page, { type: "Мәселе", title, anonymous: true });
    await acknowledge(receipt);
    await logout(page);

    for (const viewer of [null, ACCOUNTS.boss, ACCOUNTS.teacher]) {
      await page.goto("/");
      if (viewer) await loginAs(page, viewer);
      const detail = await openPost(page, title);
      await expect(detail.getByText("Анонимді автор")).toBeVisible();
      await expect(detail).not.toContainText("Аружан Әлім");
      await expect(detail).not.toContainText(ACCOUNTS.user);
      if (viewer) await logout(page);
    }
  });
});

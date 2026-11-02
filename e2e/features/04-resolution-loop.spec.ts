// E2E 04 — Issue resolution loop: resolved / not resolved (issue #39).
import { expect, test } from "@playwright/test";
import { ACCOUNTS, claimWithCode, isolateClient, loginAs, openPost, otherPerson, publish, unique } from "../support";

isolateClient(4);

test.describe("#39 resolution loop", () => {
  test("manager resolves, author says not resolved, the issue returns to review", async ({ page, browser }) => {
    const title = unique("Шешілу циклі");
    await page.goto("/");
    const { number, code, receipt } = await publish(page, { type: "Мәселе", title, anonymous: true });
    // The receipt code binds this guest session as the post owner.
    const own = await claimWithCode(page, receipt, number, code);
    await expect(own.getByRole("heading", { level: 1, name: title })).toBeVisible();

    const staff = await otherPerson(browser, 4);
    await loginAs(staff.page, ACCOUNTS.boss);
    const managed = await openPost(staff.page, title);
    await managed.getByRole("combobox", { name: "Мәртебе" }).selectOption({ label: "Шешілді" });
    await managed.getByRole("button", { name: "Мәртебені сақтау" }).click();
    await expect(staff.page.getByText("Мәртебе жаңартылды.").first()).toBeVisible();

    await page.reload();
    const mine = await openPost(page, title);
    await expect(mine.getByText("Мәселеңіз шешілді ме?")).toBeVisible();
    await mine.getByRole("button", { name: "Әлі шешілген жоқ" }).click();
    await expect(mine.getByText("Қаралуда").first()).toBeVisible();
    await expect(mine.getByText("Мәселеңіз шешілді ме?")).toHaveCount(0);

    // The manager sees the reopened status too.
    const again = await openPost(staff.page, title);
    await expect(again.getByRole("combobox", { name: "Мәртебе" })).toHaveValue(/reviewing|in_progress/);
    await staff.context.close();
  });
});

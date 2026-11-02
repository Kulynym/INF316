// E2E 13 — Official reply and status transitions (issue #48).
import { expect, test } from "@playwright/test";
import { ACCOUNTS, claimWithCode, isolateClient, loginAs, openPost, otherPerson, publish, unique } from "../support";

isolateClient(13);

test.describe("#48 official reply and status", () => {
  test("a manager replies officially and moves the issue to review; the author sees both", async ({ page, browser }) => {
    const title = unique("Ресми жауап сынағы");
    const answer = unique("Әкімшілік мәселені қарап жатыр");
    await page.goto("/");
    const { number, code, receipt } = await publish(page, { type: "Мәселе", title, anonymous: true });
    await claimWithCode(page, receipt, number, code);

    const staff = await otherPerson(browser, 13);
    await loginAs(staff.page, ACCOUNTS.boss);
    const managed = await openPost(staff.page, title);
    await managed.getByRole("combobox", { name: "Мәртебе" }).selectOption({ label: "Қаралуда" });
    await managed.getByRole("button", { name: "Мәртебені сақтау" }).click();
    await expect(staff.page.getByText("Мәртебе жаңартылды.").first()).toBeVisible();
    await managed.getByRole("textbox", { name: "Жауап мәтіні" }).fill(answer);
    await managed.getByRole("button", { name: "Жауапты жариялау" }).click();
    await expect(managed.getByText(answer)).toBeVisible();
    await staff.context.close();

    const seen = await openPost(page, title);
    await expect(seen.getByText("MAXBALL EDTECH ресми жауабы")).toBeVisible();
    await expect(seen.getByText(answer)).toBeVisible();
    await expect(seen.getByText("Қаралуда").first()).toBeVisible();
    // After an official reply the author can no longer edit the post.
    await expect(seen.getByRole("button", { name: "Өзгерту", exact: true })).toHaveCount(0);
  });

  test("regular users never see the management tools", async ({ page }) => {
    await page.goto("/");
    await loginAs(page, ACCOUNTS.user);
    const detail = await openPost(page, "Сабақ жазбасының дыбысы кейде естілмейді");
    await expect(detail.getByRole("button", { name: "Жауапты жариялау" })).toHaveCount(0);
    await expect(detail.getByRole("combobox", { name: "Мәртебе" })).toHaveCount(0);
  });
});

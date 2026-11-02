// E2E 12 — Teacher ratings (issue #47).
import { expect, test } from "@playwright/test";
import { ACCOUNTS, isolateClient, loginAs, logout, openSection, unique } from "../support";

isolateClient(12);

test.describe("#47 teacher ratings", () => {
  test("a signed-in user rates a teacher and the rating is kept", async ({ page }) => {
    const comment = unique("Түсінікті түсіндіреді");
    await page.goto("/");
    await loginAs(page, ACCOUNTS.user);
    await openSection(page, "Оқытушылар");
    const teacher = page.getByRole("article").filter({ hasText: "Нұржан Омар" });
    await teacher.getByRole("button", { name: /Бағалау|Бағаны өзгерту/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "4 жұлдыз" }).click();
    await dialog.getByPlaceholder("Оқытушы туралы ойыңыз").fill(comment);
    await dialog.getByRole("button", { name: "Бағаны сақтау" }).click();
    await expect(dialog).toHaveCount(0);

    await teacher.getByRole("button", { name: "Бағаны өзгерту" }).click();
    await expect(page.getByRole("dialog").getByPlaceholder("Оқытушы туралы ойыңыз")).toHaveValue(comment);
    await expect(page.getByRole("dialog").getByRole("button", { name: "4 жұлдыз" })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await logout(page);
  });

  test("a guest is asked to sign in before rating", async ({ page }) => {
    await page.goto("/");
    await openSection(page, "Оқытушылар");
    await page.getByRole("article").first().getByRole("button", { name: /Бағалау|Бағаны өзгерту/ }).click();
    await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
  });
});

// E2E 05 — Accounts: login, logout and failed login (issue #40).
import { expect, test } from "@playwright/test";
import { ACCOUNTS, isolateClient, loginAs, logout } from "../support";

isolateClient(5);

test.describe("#40 login and logout", () => {
  test("a demo user logs in, sees the private sections and logs out", async ({ page }) => {
    await page.goto("/");
    await loginAs(page, ACCOUNTS.user);
    await expect(page.getByRole("button", { name: /Аружан Әлім/ })).toBeVisible();
    await logout(page);
    await expect(page.getByRole("button", { name: /Аружан Әлім/ })).toHaveCount(0);
  });

  test("a wrong password is rejected and the form keeps the email", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Кіру", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Email" }).fill(ACCOUNTS.user);
    await dialog.getByRole("textbox", { name: "Құпиясөз" }).fill("wrong-password-1");
    await dialog.getByRole("button", { name: "Кіру", exact: true }).click();
    await expect(dialog.locator(".error, [role=alert]").filter({ hasText: /./ }).first()).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Email" })).toHaveValue(ACCOUNTS.user);
    await expect(page.getByRole("button", { name: "Шығу" })).toHaveCount(0);
  });
});

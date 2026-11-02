// E2E 06 — Account registration (issue #41). In the self-contained deployment
// (MAXBALL_DEMO=1) a new account is confirmed through a test link instead of
// a real email; the spec follows that link through the UI.
import { expect, test } from "@playwright/test";
import { isolateClient } from "../support";

isolateClient(6);

test.describe("#41 registration", () => {
  test("a visitor registers and is signed in", async ({ page }) => {
    const email = `e2e-${Date.now().toString(36)}@example.com`;
    await page.goto("/");
    await page.getByRole("button", { name: "Кіру", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Тіркелу" }).click();
    const form = page.getByRole("dialog", { name: "Аккаунт ашу" });
    await form.getByRole("textbox", { name: "Аты-жөніңіз" }).fill("E2E Тіркелуші");
    await form.getByRole("textbox", { name: "Email" }).fill(email);
    await form.getByRole("textbox", { name: "Телефон" }).fill("+77001234567");
    await form.getByRole("textbox", { name: "Құпиясөз" }).fill("E2e-strong-pass-2026");
    await form.getByRole("button", { name: "Тіркелу" }).click();

    // Demo mode hands the confirmation token to the UI instead of emailing it.
    await expect(form.getByRole("status")).toBeVisible();
    await form.getByRole("button", { name: "Сынақ email-ын растау" }).click();
    await expect(form).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Шығу" })).toBeVisible();
    await expect(page.getByRole("button", { name: /E2E Тіркелуші/ })).toBeVisible();
  });

  test("a too short password is refused", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Кіру", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Тіркелу" }).click();
    const form = page.getByRole("dialog", { name: "Аккаунт ашу" });
    await form.getByRole("textbox", { name: "Аты-жөніңіз" }).fill("Қысқа Құпиясөз");
    await form.getByRole("textbox", { name: "Email" }).fill(`short-${Date.now()}@example.com`);
    await form.getByRole("textbox", { name: "Телефон" }).fill("+77001234567");
    await form.getByRole("textbox", { name: "Құпиясөз" }).fill("123");
    await form.getByRole("button", { name: "Тіркелу" }).click();
    await expect(page.getByRole("button", { name: "Шығу" })).toHaveCount(0);
    await expect(form).toBeVisible();
  });
});

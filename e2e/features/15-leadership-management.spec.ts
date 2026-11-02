// E2E 15 — Leadership: catalog and staff management (issue #50).
import { expect, test } from "@playwright/test";
import { ACCOUNTS, isolateClient, loginAs, openSection, unique } from "../support";

isolateClient(15);

test.describe("#50 leadership management", () => {
  test("leadership adds a course to the catalog and it becomes selectable", async ({ page }) => {
    const course = unique("E2E курс");
    await page.goto("/");
    await loginAs(page, ACCOUNTS.boss);
    await openSection(page, "Басқару");
    await page.getByRole("button", { name: /^Курстар \d+/ }).click();
    await page.getByRole("button", { name: "Қосу" }).click();
    const dialog = page.getByRole("dialog", { name: "Курс қосу" });
    await dialog.getByRole("textbox").first().fill(course);
    await dialog.getByRole("button", { name: "Қосу" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("main").getByText(course, { exact: true })).toBeVisible();

    await page.goto("/");
    await page.getByRole("button", { name: "Жазба қалдыру" }).first().click();
    await expect(page.getByRole("combobox", { name: "Курс" }).getByRole("option", { name: course })).toHaveCount(1);
  });

  test("leadership adds a staff account with a role", async ({ page }) => {
    const email = `staff-${Date.now().toString(36)}@example.com`;
    await page.goto("/");
    await loginAs(page, ACCOUNTS.boss);
    await openSection(page, "Басқару");
    await page.getByRole("button", { name: /^Адамдар \d+/ }).click();
    await page.getByRole("button", { name: "Қосу" }).click();
    const dialog = page.getByRole("dialog", { name: "Адам қосу" });
    await dialog.getByRole("textbox", { name: "Аты-жөні" }).fill("E2E Әкімші");
    await dialog.getByRole("textbox", { name: "Email" }).fill(email);
    await dialog.getByRole("textbox", { name: "Телефон" }).fill("+77005554433");
    await dialog.getByRole("combobox", { name: "Рөл" }).selectOption({ label: "Әкімші" });
    await dialog.getByRole("button", { name: /Қосу|Шақыру жіберу/ }).click();
    await expect(dialog).toHaveCount(0);
    const row = page.getByRole("row").filter({ hasText: email });
    await expect(row).toBeVisible();
    await expect(row.getByRole("combobox")).toHaveValue("admin");
  });

  test("a regular user has no management section", async ({ page }) => {
    await page.goto("/");
    await loginAs(page, ACCOUNTS.user);
    await expect(page.getByRole("navigation").getByRole("button", { name: "Басқару" })).toHaveCount(0);
  });
});

// E2E 16 — Statistics and Excel export (issue #51).
import { expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import { ACCOUNTS, isolateClient, loginAs, openSection } from "../support";

isolateClient(16);

test.describe("#51 statistics and export", () => {
  test("a manager reads the statistics and downloads a valid Excel report", async ({ page }) => {
    await page.goto("/");
    await loginAs(page, ACCOUNTS.boss);
    await openSection(page, "Статистика");
    const main = page.getByRole("main");
    await expect(main.getByText("Барлық жазба")).toBeVisible();
    await expect(main.getByRole("heading", { name: "Жазба түрлері" })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Оқытушы рейтингі" })).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      main.getByRole("link", { name: "Excel" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(await download.path());
    expect(workbook.worksheets.length).toBeGreaterThan(0);
    expect(workbook.worksheets[0].rowCount).toBeGreaterThan(1);
  });

  test("statistics are not available to regular users", async ({ page }) => {
    await page.goto("/");
    await loginAs(page, ACCOUNTS.user);
    await expect(page.getByRole("navigation").getByRole("button", { name: "Статистика" })).toHaveCount(0);
    const response = await page.request.get("/api/export");
    expect(response.ok()).toBe(false);
  });
});

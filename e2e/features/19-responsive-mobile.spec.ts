// E2E 19 — Responsive layout on mobile (issue #54).
import { expect, test } from "@playwright/test";
import { isolateClient, openPost } from "../support";

isolateClient(19);

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 720 }]) {
  test.describe(`#54 mobile ${viewport.width}px`, () => {
    test.use({ viewport });

    test("feed, menu and post detail fit without horizontal scrolling", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("article").first()).toBeVisible();
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(await overflow()).toBeLessThanOrEqual(1);

      await page.getByRole("button", { name: "Мәзір" }).click();
      await expect(page.getByRole("navigation").getByRole("button", { name: /^Оқытушылар/ })).toBeVisible();
      await page.getByRole("button", { name: "Мәзірді жабу" }).first().click();

      const detail = await openPost(page, "Орталықтағы қолдау ерекше ұнайды");
      const box = await detail.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(viewport.width);
      expect(await overflow()).toBeLessThanOrEqual(1);
    });
  });
}

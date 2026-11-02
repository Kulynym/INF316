// E2E 08 — File attachments: upload and private download (issue #43).
import { expect, test } from "@playwright/test";
import { acknowledge, isolateClient, publish, unique } from "../support";

isolateClient(8);

test.describe("#43 attachments", () => {
  test("an author attaches a file and it downloads intact from the post", async ({ page }) => {
    const title = unique("Файлы бар жазба");
    const content = `MAXBALL e2e attachment ${Date.now()}\n`;
    await page.goto("/");
    const { number, receipt } = await publish(page, {
      type: "Мәселе",
      title,
      anonymous: true,
      attachment: { name: "e2e-note.txt", mimeType: "text/plain", buffer: Buffer.from(content) },
    });
    await acknowledge(receipt);
    const detail = page.getByRole("dialog", { name: `Өтініш №${number}` });
    const link = detail.getByRole("link", { name: /e2e-note\.txt/ });
    await expect(link).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
    expect(download.suggestedFilename()).toBe("e2e-note.txt");
    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe(content);
  });

  test("the private file route refuses requests without access", async ({ request }) => {
    const response = await request.get("/api/files/00000000-0000-4000-8000-00000000abcd");
    expect(response.ok()).toBe(false);
    expect([400, 401, 403, 404]).toContain(response.status());
  });
});

// Shared helpers for the per-feature end-to-end specs in e2e/features
// (Assignment 3, issues #36-#54). Every helper drives the real UI; tests never
// call the API directly. Receipt codes are secrets: they are used, never logged.
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

export const ACCOUNTS = {
  user: "demo1@maxball.example",
  teacher: "demo4@maxball.example",
  boss: "demo6@maxball.example",
} as const;
export const PASSWORD = "Maxball2026";

/**
 * Gives a spec file its own client address. The app rate-limits posting per
 * IP (12 per 10 minutes), which is real production behaviour; one shared CI
 * address would make later specs fail for reasons unrelated to their feature.
 */
export function isolateClient(octet: number) {
  test.use({
    extraHTTPHeaders: { "x-forwarded-for": `10.20.${octet}.${Math.floor(Math.random() * 250) + 1}` },
  });
}

/** Unique, readable marker so a spec only ever touches its own posts. */
export const unique = (label: string) =>
  `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function closeDialogs(page: Page) {
  for (let i = 0; i < 3; i++) {
    const dialog = page.getByRole("dialog");
    if (!(await dialog.first().isVisible())) return;
    await page.keyboard.press("Escape");
    try {
      await expect(dialog).toHaveCount(0, { timeout: 2_000 });
    } catch {
      await dialog.first().getByRole("button", { name: "Жабу" }).first().click();
    }
  }
}

export async function loginAs(page: Page, email: string, password = PASSWORD) {
  await page.getByRole("button", { name: "Кіру", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Email" }).fill(email);
  await dialog.getByRole("textbox", { name: "Құпиясөз" }).fill(password);
  await dialog.getByRole("button", { name: "Кіру", exact: true }).click();
  await expect(page.getByRole("button", { name: "Шығу" })).toBeVisible();
}

export async function logout(page: Page) {
  await closeDialogs(page);
  const menu = page.getByRole("button", { name: "Мәзір" });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Шығу" }).click();
  await expect(page.getByRole("button", { name: "Кіру", exact: true })).toBeVisible();
}

/** Opens a side-menu destination (sidebar on desktop, drawer on mobile). */
export async function openSection(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Мәзір" });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

export type NewPost = {
  type?: "Пікір" | "Ұсыныс" | "Мәселе";
  title: string;
  body?: string;
  anonymous?: boolean;
  authorName?: string;
  attachment?: { name: string; mimeType: string; buffer: Buffer };
};

/**
 * Publishes feedback through the composer. Guests get the receipt number and
 * secret code shown once in the receipt dialog, which stays open so callers
 * can choose "Кодпен ашу" or acknowledge it. Signed-in authors get no
 * receipt (the post belongs to the account): `receipt` is then null.
 */
export async function publish(page: Page, post: NewPost) {
  const signedIn = await page.getByRole("button", { name: "Шығу" }).isVisible();
  await page.getByRole("button", { name: "Жазба қалдыру" }).first().click();
  const composer = page.getByRole("dialog", { name: "Кері байланыс қалдыру" });
  await composer.getByRole("button", { name: post.type ?? "Ұсыныс", exact: true }).click();
  await composer.getByRole("textbox", { name: "Тақырып", exact: true }).fill(post.title);
  await composer
    .getByRole("textbox", { name: "Мәтін", exact: true })
    .fill(post.body ?? `${post.title} — браузерлік e2e тексерісінің мәтіні.`);
  const anonymous = composer.getByRole("switch", { name: "Анонимді жариялау" });
  if (post.anonymous !== undefined && (await anonymous.isChecked()) !== post.anonymous)
    await anonymous.click();
  const name = composer.getByRole("textbox", { name: "Атыңыз" });
  if (post.authorName && (await name.isVisible())) await name.fill(post.authorName);
  if (post.attachment) {
    await composer.locator('input[type="file"]').setInputFiles(post.attachment);
    await expect(composer.getByText("Жүктелді")).toBeVisible();
  }
  await composer.getByRole("button", { name: "Жариялау" }).click();
  if (signedIn) {
    await expect(page.getByText("Жазбаңыз жарияланды.").first()).toBeVisible();
    await expect(composer).toHaveCount(0);
    return { number: "", code: "", receipt: null };
  }
  const receipt = page.getByRole("dialog", { name: "Жазбаңыз жарияланды" });
  await expect(receipt).toBeVisible();
  const heading = await receipt.getByRole("heading", { name: /Өтініш №\d+/ }).innerText();
  const number = heading.replace(/\D/g, "");
  const code = (await receipt.locator(".secret-code code").innerText()).trim();
  return { number, code, receipt };
}

/** Closes the guest receipt dialog ("Түсінікті"); no-op for account posts. */
export async function acknowledge(receipt: Locator | null) {
  if (receipt) await receipt.getByRole("button", { name: "Түсінікті" }).click();
}

/** Loads the feed fresh and searches it (waits for the app to settle first). */
export async function searchFeed(page: Page, text: string) {
  await page.goto("/");
  await expect(page.getByRole("article").first()).toBeVisible();
  const search = page.getByRole("textbox", { name: "Жазбалардан іздеу" });
  await search.fill(text);
  await expect(search).toHaveValue(text);
}

/** Searches the public feed and opens the post detail dialog by its title. */
export async function openPost(page: Page, title: string) {
  await searchFeed(page, title);
  const card = page.getByRole("article").filter({ hasText: title }).first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: new RegExp(escape(title)) }).click();
  const detail = page.getByRole("dialog", { name: /Өтініш №/ });
  await expect(detail.getByRole("heading", { level: 1, name: title })).toBeVisible();
  return detail;
}

/** A second, independent browser session (another person). */
export async function otherPerson(browser: Browser, octet: number) {
  const context = await browser.newContext({
    baseURL: process.env.TEST_URL,
    extraHTTPHeaders: { "x-forwarded-for": `10.30.${octet}.${Math.floor(Math.random() * 250) + 1}` },
  });
  const page = await context.newPage();
  await page.goto("/");
  return { context, page };
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Claims a guest post with its receipt: "Кодпен ашу" opens the receipt
 * finder, the number and secret code unlock the post for this session.
 */
export async function claimWithCode(page: Page, receipt: Locator | null, number: string, code: string) {
  if (!receipt) throw new Error("Only guest posts have a receipt to claim.");
  await receipt.getByRole("button", { name: "Кодпен ашу" }).click();
  const finder = page.getByRole("dialog", { name: "Өтінішті табу" });
  await finder.locator('input[name="number"]').fill(number);
  await finder.locator('input[name="code"]').fill(code);
  await finder.locator('button[type="submit"]').click();
  const detail = page.getByRole("dialog", { name: `Өтініш №${number}` });
  await expect(detail.getByRole("heading", { level: 1 })).toBeVisible();
  return detail;
}

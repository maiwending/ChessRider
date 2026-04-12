import { expect, test } from '@playwright/test';

test('guest can launch a practice game from home', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /play as guest/i }).click();
  await expect(page).toHaveURL(/\/Play$/);
  await expect(page.getByText('Practice')).toBeVisible();
  await expect(page.getByText(/White to move/i)).toBeVisible();
});

test('promotion flow offers choices and records promotion SAN', async ({ page }) => {
  await page.goto('/Play?qaScenario=promotion');
  await page.getByLabel('Square a7').click();
  await page.getByLabel('Square a8').click();
  await expect(page.getByRole('dialog', { name: /choose promotion piece/i })).toBeVisible();
  await page.getByRole('button', { name: /queen/i }).click();
  await expect(page.getByText(/=Q/i)).toBeVisible();
});

test('timeout scenario ends game on clock', async ({ page }) => {
  await page.goto('/Play?qaScenario=timeout');
  await expect(page.getByText(/wins on time/i)).toBeVisible();
});

test('practice game resumes after reload', async ({ page }) => {
  await page.goto('/Play');
  await page.getByLabel('Square e2').click();
  await page.getByLabel('Square e4').click();
  await expect(page.getByText('e4')).toBeVisible();
  await page.reload();
  await expect(page.getByText('e4')).toBeVisible();
});

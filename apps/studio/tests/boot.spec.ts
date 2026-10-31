import { expect, test } from '@playwright/test';

test('app boots without console or page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-booted', 'true');
  expect(errors).toEqual([]);
});

test('shows the real-map panel beside the preview canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('map-panel')).toBeVisible();
  await expect(page.getByTestId('preview-canvas')).toBeVisible();
});

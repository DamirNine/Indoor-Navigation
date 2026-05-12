import { test, expect } from '@playwright/test';

test('create building with nodes/edges and export ZIP', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('building-id').fill('test-corp');
  await page.getByTestId('building-name').fill('Тестовый корпус');

  await page.getByTestId('add-floor').click();
  await expect(page.locator('text=1 этаж')).toBeVisible();

  await page.getByTestId('tool-node').click();

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  const clickCanvas = async (dx: number, dy: number, label: string, type = 'room') => {
    await page.mouse.click(box!.x + dx, box!.y + dy);
    await page.getByTestId('node-label').fill(label);
    if (type !== 'room') await page.getByTestId('node-type').selectOption(type);
    await page.getByTestId('node-confirm').click();
  };

  await clickCanvas(200, 200, 'Вход', 'entrance');
  await clickCanvas(400, 200, 'Кабинет 101');
  await clickCanvas(600, 200, 'Кабинет 102');

  await page.getByTestId('tool-edge').click();
  await page.mouse.click(box!.x + 200, box!.y + 200);
  await page.mouse.click(box!.x + 400, box!.y + 200);
  await page.getByTestId('edge-confirm').click();

  await page.mouse.click(box!.x + 400, box!.y + 200);
  await page.mouse.click(box!.x + 600, box!.y + 200);
  await page.getByTestId('edge-confirm').click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-button').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('test-corp.zip');
});

test('export blocked when graph has isolated node', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('building-id').fill('b1');
  await page.getByTestId('building-name').fill('Building');
  await page.getByTestId('add-floor').click();
  await page.getByTestId('tool-node').click();

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  await page.mouse.click(box!.x + 300, box!.y + 300);
  await page.getByTestId('node-label').fill('Isolated');
  await page.getByTestId('node-confirm').click();

  await page.getByTestId('export-button').click();
  await expect(page.getByTestId('export-errors')).toBeVisible();
  await expect(page.getByTestId('export-errors')).toContainText('Изолированный');
});

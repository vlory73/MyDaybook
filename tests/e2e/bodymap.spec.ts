import { test, expect } from './fixtures';

import type { Page } from '@playwright/test';

const body = (page: Page) => page.locator('svg[role=group]');

// The body map components on the (developer-only) style guide page: no entry screens exist yet.

test('tapping a region reports its localised name and a position inside it', async ({ page }) => {
	await page.goto('/styleguide');
	const out = page.getByTestId('bodymap-tap');
	await expect(out).toContainText('Nothing chosen');
	const knee = body(page).getByRole('button', { name: 'Your right knee' });
	await knee.scrollIntoViewIfNeeded();
	await knee.click();
	await expect(out).toContainText('Your right knee');
	await expect(out).toContainText('2d-front-v1');
	const text = (await out.textContent()) ?? '';
	const u = Number(/u (\d\.\d\d)/.exec(text)?.[1]);
	const v = Number(/v (\d\.\d\d)/.exec(text)?.[1]);
	expect(u).toBeGreaterThan(0.3);
	expect(u).toBeLessThan(0.7);
	expect(v).toBeGreaterThan(0.3);
	expect(v).toBeLessThan(0.7);
	// The front view mirrors: the person's right is drawn on the left of the screen.
	const box = (await knee.boundingBox())!;
	expect(box.x + box.width / 2).toBeLessThan(375 / 2);
	await body(page).getByRole('button', { name: 'Your left knee' }).click();
	await expect(out).toContainText('Your left knee');
});

test('a tap near the corner of a region gives a u, v near that corner', async ({ page }) => {
	await page.goto('/styleguide');
	const chest = body(page).getByRole('button', { name: 'Right side of your chest' });
	await chest.scrollIntoViewIfNeeded();
	const box = (await chest.boundingBox())!;
	await chest.click({ position: { x: box.width * 0.5, y: box.height * 0.2 } });
	const text = (await page.getByTestId('bodymap-tap').textContent()) ?? '';
	expect(Number(/v (\d\.\d\d)/.exec(text)?.[1])).toBeLessThan(0.35);
});

test('the front and back toggle switches the outline and the side labels', async ({ page }) => {
	await page.goto('/styleguide');
	const front = page.getByRole('radio', { name: 'Front' });
	const back = page.getByRole('radio', { name: 'Back' });
	await expect(front).toBeChecked();
	await expect(body(page).getByRole('button', { name: 'Your right knee' })).toBeVisible();
	await expect(body(page).getByRole('button', { name: 'Your right calf' })).toHaveCount(0);
	await back.scrollIntoViewIfNeeded();
	await back.click();
	await expect(back).toBeChecked();
	const calf = body(page).getByRole('button', { name: 'Your right calf' });
	await expect(calf).toBeVisible();
	await expect(body(page).getByRole('button', { name: 'Lower back' })).toBeVisible();
	await expect(body(page).getByRole('button', { name: 'Your right shin' })).toHaveCount(0);
	// The back view does not mirror: the person's right is on the right of the screen.
	const box = (await calf.boundingBox())!;
	expect(box.x + box.width / 2).toBeGreaterThan(375 / 2);
	await calf.click();
	await expect(page.getByTestId('bodymap-tap')).toContainText('2d-back-v1');
});

test('Find lists the regions, filters them and returns the chosen one', async ({ page }) => {
	await page.goto('/styleguide');
	const search = page.getByLabel('Find a body part');
	await search.scrollIntoViewIfNeeded();
	const list = page.getByRole('list', { name: 'Body parts' });
	expect(await list.getByRole('button').count()).toBeGreaterThan(30);
	await search.fill('left elb');
	await expect(list.getByRole('button')).toHaveText(['Your left elbow']);
	await list.getByRole('button', { name: 'Your left elbow' }).click();
	await expect(page.getByTestId('bodymap-pick')).toContainText('Your left elbow');
	await expect(page.getByTestId('bodymap-pick')).toContainText('2d-front-v1');
	await search.fill('qqq');
	await expect(page.getByText('No body part matches that.')).toBeVisible();
});

test('regions work from the keyboard', async ({ page }) => {
	await page.goto('/styleguide');
	const knee = body(page).getByRole('button', { name: 'Your right knee' });
	await knee.scrollIntoViewIfNeeded();
	await knee.focus();
	await expect(knee).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('bodymap-tap')).toContainText('Your right knee');
	await expect(page.getByTestId('bodymap-tap')).toContainText('u 0.50, v 0.50');
	// Tab moves on to the next region, in a head-to-toe, right-then-left order.
	await page.keyboard.press('Tab');
	const next = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
	expect(next).toBeTruthy();
	expect(next).not.toBe('Your right knee');
	await page.keyboard.press(' ');
	await expect(page.getByTestId('bodymap-tap')).toContainText(next!);
});

test('names are shown in Danish when the language is Danish', async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('locale', 'da'));
	await page.goto('/styleguide');
	await expect(page.getByRole('radio', { name: 'Bagside' })).toBeVisible();
	const knee = body(page).getByRole('button', { name: 'Dit højre knæ' });
	await knee.scrollIntoViewIfNeeded();
	await knee.click();
	await expect(page.getByTestId('bodymap-tap')).toContainText('Dit højre knæ');
	await page.getByLabel('Find en kropsdel').fill('venstre skulder');
	await expect(page.getByRole('list', { name: 'Kropsdele' }).getByRole('button')).toHaveText([
		'Din venstre skulder'
	]);
});

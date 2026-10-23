import { test, expect } from './fixtures';
import { seedRecords, signUpApiAccount, unlockWith } from './helpers';
import { at, heatSet } from './trends-data';

// "Where it hurt" (heat map) in Trends, and the small body on pain entries on Today. Synthetic data only.
const point = (region: string, side: string, space: string, intensity: number) => ({
	region,
	side,
	space,
	u: 0.5,
	v: 0.5,
	intensity,
	qualities: []
});

test('heat map: colours, list, close-ups and the timeline thumbnail', async ({ page }) => {
	const account = await signUpApiAccount(page.request);
	await seedRecords(page.request, account, [
		...heatSet(),
		{
			v: 1,
			type: 'pain',
			at: at(0, 6),
			points: [point('lower_back', 'midline', '2d-back-v1', 5), point('knee', 'right', '2d-front-v1', 4)]
		},
		{ v: 1, type: 'pain', at: at(0, 7), points: [point('knee', 'left', '2d-front-v1', 3)] }
	]);
	await page.goto('/trends');
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, account.passphrase);

	const card = page
		.locator('section.card')
		.filter({ has: page.getByRole('heading', { name: 'Where it hurt', exact: true }) });
	await expect(card).toBeVisible({ timeout: 15_000 });
	const figure = card.getByTestId('heat-figure').locator('svg.body');
	const rows = card.getByTestId('heat-list').getByRole('listitem');

	await expect(figure).toHaveAccessibleName(/^Body, front view, coloured by days logged\./);
	await expect(card.getByText('Days logged')).toBeVisible();
	await expect(card.getByText('Not logged')).toBeVisible();
	await expect(card.getByText('Tap the head, a hand or a foot to look closer.')).toBeVisible();

	// The list: most days first; whole-head, band and whole-belly style areas count towards their parts.
	await expect(rows).toHaveCount(8);
	await expect(rows.nth(0)).toContainText('Lower back');
	await expect(rows.nth(0)).toContainText('12 days');
	await expect(rows.nth(0)).toContainText('avg 5');
	await expect(rows.nth(1)).toContainText('Your right temple');
	await expect(rows.nth(1)).toContainText('7 days');
	const more = card.getByRole('button', { name: /^Show all \d+ places$/ });
	await more.click();
	expect(await rows.count()).toBeGreaterThan(8);
	await card.getByRole('button', { name: 'Show fewer places' }).click();
	await expect(rows).toHaveCount(8);

	// Front: the head is one coloured shape and a button; the darkest step belongs to the most days.
	await expect(figure.locator('[data-region=head]')).toHaveAttribute('data-heat', /[1-5]/);
	await card.getByRole('radio', { name: 'Back', exact: true }).click();
	await expect(figure).toHaveAccessibleName(/^Body, back view/);
	await expect(figure.locator('[data-region=lower_back]')).toHaveAttribute('data-heat', '5');
	await card.getByRole('radio', { name: 'Front', exact: true }).click();

	// Head close-up: its own legend and list, then back to the body.
	await figure.getByRole('button', { name: 'Look closer: Head' }).click();
	await expect(card.getByRole('button', { name: 'Back to the body' })).toBeVisible();
	await expect(figure).toHaveAccessibleName(/^Head, front view, coloured by days logged\./);
	await expect(figure.locator('[data-region=temple][data-side=right]')).toHaveAttribute('data-heat', '5');
	await expect(rows.first()).toContainText('Your right temple');
	await expect(rows.first()).toContainText('7 days');
	await expect(card.getByText('Lower back')).toHaveCount(0);
	await card.getByRole('radio', { name: 'Back', exact: true }).click();
	await expect(figure).toHaveAccessibleName(/^Head, back view/);
	await card.getByRole('button', { name: 'Back to the body' }).click();
	await expect(figure).toHaveAccessibleName(/^Body, front view/);

	// A hand close-up.
	await figure.getByRole('button', { name: 'Look closer: Your left hand' }).click();
	await expect(rows.first()).toContainText('Your left thumb');
	await expect(rows.first()).toContainText('1 day');
	await card.getByRole('button', { name: 'Back to the body' }).click();

	// The back view draws the feet as heels; a heel opens the foot close-up on the sole (#73).
	await card.getByRole('radio', { name: 'Back', exact: true }).click();
	await figure.getByRole('button', { name: 'Look closer: Your left foot' }).click();
	await expect(card.getByRole('button', { name: 'Back to the body' })).toBeVisible();
	await card.getByRole('button', { name: 'Back to the body' }).click();

	// Today: one small body per pain entry; two views share one box.
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, account.passphrase);
	const thumbs = page.locator('.thumb');
	await expect(thumbs).toHaveCount(2, { timeout: 15_000 });
	await expect(thumbs.first()).toHaveAttribute('aria-hidden', 'true');
	const groups = await thumbs.evaluateAll((els) => els.map((e) => e.querySelectorAll('svg > g').length));
	expect(groups.sort()).toEqual([1, 2]);
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
	expect(overflow).toBeLessThanOrEqual(0);
});

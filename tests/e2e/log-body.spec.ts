import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { signUpAndSignIn } from './helpers';

// Synthetic data only. Each test uses its own account.
const timeline = (page: Page) => page.getByRole('list').filter({ has: page.locator('time') });
const toast = (page: Page, text: string) => page.getByRole('status').getByText(text, { exact: true });

/** "YYYY-MM-DD" of the local day `offset` days from today, as a datetime-local value prefix. */
function day(offset = 0): string {
	const d = new Date();
	d.setHours(12);
	d.setDate(d.getDate() + offset);
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function openTile(page: Page, name: string) {
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name, exact: true }).click();
}

const save = (page: Page) => page.getByRole('button', { name: 'Save', exact: true }).click();

async function deleteWithUndo(page: Page, title: string | RegExp) {
	await timeline(page).getByText(title).click();
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(toast(page, 'Entry deleted')).toBeVisible();
	await expect(timeline(page).getByText(title)).toBeHidden();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(toast(page, 'Entry restored')).toBeVisible();
	await expect(timeline(page).getByText(title)).toBeVisible();
}

test('feeling: faces, scales, a new tag with strength; edit; delete with undo', async ({ page }) => {
	await signUpAndSignIn(page);
	await openTile(page, 'Feeling');
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	await page.getByRole('radiogroup', { name: 'Mood' }).getByRole('radio', { name: '4/5' }).click();
	await page.getByRole('radiogroup', { name: 'Stress' }).getByRole('radio', { name: '2/5' }).click();
	await page.getByRole('button', { name: 'New', exact: true }).click();
	await page.getByLabel('Name of the new tag').fill('Headache');
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.getByRole('button', { name: 'Headache: strength 2 of 3' }).click();
	await page.getByRole('dialog').getByLabel('Note', { exact: true }).fill('Synthetic note after lunch');
	await save(page);
	await expect(toast(page, 'Saved')).toBeVisible();
	const entry = timeline(page).getByText('Mood 4 · Stress 2 · Headache (2) · Synthetic note after lunch');
	await expect(entry).toBeVisible();
	await expect(timeline(page).getByText('Feeling', { exact: true })).toBeVisible();

	// The tag is now a chip; a second feeling remembers "last time".
	await openTile(page, 'Feeling');
	await expect(page.getByText('last time: 4')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Headache', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Close' }).click();

	// Edit
	await entry.click();
	await expect(
		page.getByRole('radiogroup', { name: 'Mood' }).getByRole('radio', { name: '4/5' })
	).toBeChecked();
	await page.getByRole('radiogroup', { name: 'Energy' }).getByRole('radio', { name: '3/5' }).click();
	await save(page);
	await expect(timeline(page).getByText(/Mood 4 · Energy 3 · Stress 2/)).toBeVisible();
	await deleteWithUndo(page, /Mood 4 · Energy 3/);
});

test('one tap on Today logs a mood and Undo removes it', async ({ page }) => {
	await signUpAndSignIn(page);
	await expect(page.getByText('A fresh page')).toBeVisible();
	await page.getByRole('button', { name: 'Good', exact: true }).click();
	await expect(toast(page, 'Mood logged')).toBeVisible();
	await expect(timeline(page).getByText('Mood 4')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Good', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByText('A fresh page')).toBeVisible();
});

test('sleep across midnight shows the right duration; Usual night repeats it in one tap', async ({
	page
}) => {
	await signUpAndSignIn(page);
	// Last night ended yesterday, so "Usual night" is offered today.
	await openTile(page, 'Sleep');
	await page.getByLabel('Fell asleep', { exact: true }).fill(`${day(-2)}T23:50`);
	await page.getByLabel('Woke up', { exact: true }).fill(`${day(-1)}T07:10`);
	await expect(page.getByTestId('sleep-duration')).toHaveText('7 h 20 min');
	await page
		.getByRole('radiogroup', { name: 'How did you sleep?' })
		.getByRole('radio', { name: '4/5' })
		.click();
	await page
		.getByRole('radiogroup', { name: 'Woke up during the night' })
		.getByRole('radio', { name: '1' })
		.click();
	await page.getByRole('button', { name: 'Nap' }).click();
	await page.getByLabel('Nap ended').fill(`${day(-1)}T13:45`);
	await save(page);
	await expect(toast(page, 'Saved')).toBeVisible();

	// It belongs to yesterday (the day of waking), so Today is still empty.
	await page.getByRole('button', { name: 'Log something' }).click();
	await expect(page.getByText('Again? One tap')).toBeVisible();
	await page.getByRole('button', { name: /Usual night/ }).click();
	await expect(toast(page, 'Saved')).toBeVisible();
	await expect(timeline(page).getByText('Slept 7 h 20 min')).toBeVisible();
	await expect(timeline(page).getByText('23:50 to 07:10')).toBeVisible();
	// Now that last night is logged, the repeat is not offered again.
	await page.getByRole('button', { name: 'Log something' }).click();
	await expect(page.getByRole('button', { name: /Usual night/ })).toBeHidden();
	await page.getByRole('button', { name: 'Close' }).click();

	// Edit: wake later; the title follows.
	await timeline(page).getByText('Slept 7 h 20 min').click();
	await page.getByLabel('Woke up', { exact: true }).fill(`${day(0)}T07:40`);
	await expect(page.getByTestId('sleep-duration')).toHaveText('7 h 50 min');
	await save(page);
	await expect(timeline(page).getByText('Slept 7 h 50 min')).toBeVisible();
	await deleteWithUndo(page, 'Slept 7 h 50 min');
});

test('sleep refuses waking before falling asleep', async ({ page }) => {
	await signUpAndSignIn(page);
	await openTile(page, 'Sleep');
	await page.getByLabel('Woke up', { exact: true }).fill(`${day(-1)}T03:00`);
	await expect(page.getByText('Waking up must come after falling asleep, within a day.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});

test('weight: typed value, steppers, context, edit, delete with undo, and the last weight as Again?', async ({
	page
}) => {
	await signUpAndSignIn(page);
	// An earlier weight, logged yesterday through the time chip.
	await openTile(page, 'Weight');
	await expect(page.getByRole('heading', { name: 'Weight' })).toBeVisible();
	await page
		.getByRole('dialog')
		.getByLabel('Time of the entry')
		.fill(`${day(-1)}T07:25`);
	await page.getByLabel('Value', { exact: true }).fill('72,4');
	await save(page);
	await expect(toast(page, 'Saved')).toBeVisible();

	// Today: prefilled with the last value, steppers move by 0.1.
	await openTile(page, 'Weight');
	await expect(page.getByLabel('Value', { exact: true })).toHaveValue('72.4');
	await expect(page.getByText(/Last time: 72\.4 kg/)).toBeVisible();
	await page.getByRole('button', { name: 'Increase' }).click();
	await page.getByRole('button', { name: 'Increase' }).click();
	await page.getByRole('button', { name: 'Decrease' }).click();
	await expect(page.getByLabel('Value', { exact: true })).toHaveValue('72.5');
	await page.getByRole('button', { name: 'Morning', exact: true }).click();
	await page.getByRole('button', { name: 'Before breakfast' }).click();
	await save(page);
	const entry = timeline(page).getByText('Weight 72.5 kg');
	await expect(entry).toBeVisible();
	await expect(timeline(page).getByText('Morning, Before breakfast')).toBeVisible();

	await entry.click();
	await page.getByLabel('Value', { exact: true }).fill('71.8');
	await save(page);
	await expect(timeline(page).getByText('Weight 71.8 kg')).toBeVisible();
	await deleteWithUndo(page, 'Weight 71.8 kg');
	await timeline(page).getByText('Weight 71.8 kg').click();
	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(toast(page, 'Entry deleted')).toBeVisible();

	// Yesterday's weight is the only one left, so it is offered as a one-tap repeat.
	await page.getByRole('button', { name: 'Log something' }).click();
	await page.getByRole('button', { name: /Weight 72\.4 kg/ }).click();
	await expect(toast(page, 'Saved')).toBeVisible();
	await expect(timeline(page).getByText('Weight 72.4 kg')).toBeVisible();
});

test('a custom measurement type with two values (Blood pressure 120/80) round-trips', async ({ page }) => {
	await signUpAndSignIn(page);
	await openTile(page, 'Measure');
	await expect(page.getByRole('button', { name: 'Weight', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.getByRole('button', { name: 'New type' }).click();
	await page.getByLabel('Name, for example Blood pressure').fill('Blood pressure');
	await page.getByLabel('Unit, for example mmHg').fill('mmHg');
	await page.getByRole('radiogroup', { name: 'Number of values' }).getByRole('radio', { name: '2' }).click();
	await page.getByRole('radiogroup', { name: 'Decimals' }).getByRole('radio', { name: '0' }).click();
	await page.getByRole('button', { name: 'Add this type' }).click();
	await expect(page.getByRole('button', { name: 'Blood pressure', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.getByLabel('Value 1').fill('120');
	await page.getByLabel('Value 2').fill('80');
	await page.getByRole('button', { name: 'Increase' }).last().click();
	await page.getByRole('button', { name: 'Decrease' }).last().click();
	await save(page);
	await expect(timeline(page).getByText('Blood pressure 120/80 mmHg')).toBeVisible();

	// The Measure tile now opens on that type, with the last values filled in.
	await openTile(page, 'Measure');
	await expect(page.getByRole('button', { name: 'Blood pressure', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByLabel('Value 1')).toHaveValue('120');
	await expect(page.getByLabel('Value 2')).toHaveValue('80');
	await page.getByRole('button', { name: 'Close' }).click();

	// Editing keeps both values.
	await timeline(page).getByText('Blood pressure 120/80 mmHg').click();
	await expect(page.getByLabel('Value 1')).toHaveValue('120');
	await page.getByLabel('Value 1').fill('118');
	await save(page);
	await expect(timeline(page).getByText('Blood pressure 118/80 mmHg')).toBeVisible();
});

test('bowel: type, flags and note; edit; delete with undo', async ({ page }) => {
	await signUpAndSignIn(page);
	await openTile(page, 'Bowel');
	await expect(
		page.getByRole('dialog').getByText('Only you can see this. Not even the server can.')
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	await page.getByRole('radio', { name: 'Type 4, Smooth' }).click();
	await page.getByRole('button', { name: 'Urgent', exact: true }).click();
	await page.getByRole('button', { name: 'Blood seen', exact: true }).click();
	await save(page);
	await expect(toast(page, 'Saved')).toBeVisible();
	await expect(timeline(page).getByText('Bowel movement')).toBeVisible();
	await expect(timeline(page).getByText('Type 4, Smooth · Urgent · Blood seen')).toBeVisible();
	// Records only: nothing reacts to a flag.
	await expect(page.getByRole('alert')).toHaveCount(0);

	await timeline(page).getByText('Bowel movement').click();
	await expect(page.getByRole('radio', { name: 'Type 4, Smooth' })).toBeChecked();
	await page.getByRole('radio', { name: 'Type 5, Soft pieces' }).click();
	await page.getByRole('button', { name: 'Blood seen', exact: true }).click();
	await save(page);
	await expect(timeline(page).getByText('Type 5, Soft pieces · Urgent')).toBeVisible();
	await deleteWithUndo(page, 'Bowel movement');
});

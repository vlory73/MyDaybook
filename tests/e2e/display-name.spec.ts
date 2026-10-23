import { test, expect } from './fixtures';
import { signUpAndSignIn, unlockWith } from './helpers';

// Synthetic data only. The service worker is blocked like in the other specs that reload (WebKit lessons).
test.use({ serviceWorkers: 'block' });

test('the name set in Me is used in the greeting and prefilled on the report', async ({ page }) => {
	const user = await signUpAndSignIn(page, '/me');
	const greeting = (rest: RegExp) => page.getByRole('heading', { level: 1, name: rest });
	const login = new RegExp(`^Good (morning|afternoon|evening), ${user.username}$`);

	// Without a name the greeting uses the login name.
	await expect(page.getByTestId('profile-name')).toBeHidden();
	await page.getByRole('link', { name: 'Today', exact: true }).click();
	await expect(greeting(login)).toBeVisible();

	await page.getByRole('link', { name: 'Me', exact: true }).click();
	await page.getByTestId('name-edit').click();
	await page.getByLabel('First name').fill('  Ada ');
	await page.getByLabel('Last name').fill('Example');
	await page.getByRole('button', { name: 'Save name' }).click();
	await expect(page.getByTestId('profile-name')).toHaveText('Ada Example');

	await page.getByRole('link', { name: 'Today', exact: true }).click();
	await expect(greeting(/^Good (morning|afternoon|evening), Ada$/)).toBeVisible();

	await page.getByRole('link', { name: 'Trends', exact: true }).click();
	await page.getByRole('link', { name: 'Reports' }).click();
	await page.getByTestId('report-headache').click();
	await expect(page.getByLabel('Name on the report')).toHaveValue('Ada Example');

	// The name is an encrypted, synced record: still there after a reload and unlock. Clearing it goes back to the login name.
	await page.goto('/me');
	await expect(page.getByRole('heading', { name: 'Your diary is locked' })).toBeVisible();
	await unlockWith(page, user.passphrase);
	await expect(page.getByTestId('profile-name')).toHaveText('Ada Example', { timeout: 15_000 });
	await page.getByTestId('name-edit').click();
	await page.getByLabel('First name').fill('');
	await page.getByLabel('Last name').fill('');
	await page.getByRole('button', { name: 'Save name' }).click();
	await expect(page.getByTestId('profile-name')).toBeHidden();
	await page.getByRole('link', { name: 'Today', exact: true }).click();
	await expect(greeting(login)).toBeVisible();
});

import { describe, expect, it } from 'vitest';
import { extractSection, parseSubject, prependSection, renderSection } from './changelog.mjs';

describe('parseSubject', () => {
	it('reads type, scope and the breaking marker', () => {
		expect(parseSubject('feat(meds): dose logging (#19)')).toEqual({
			type: 'feat',
			scope: 'meds',
			breaking: false,
			text: 'dose logging (#19)'
		});
		expect(parseSubject('fix!: drop the old format')).toMatchObject({
			type: 'fix',
			scope: null,
			breaking: true
		});
	});
	it('ignores subjects that are not Conventional Commits', () => {
		expect(parseSubject('Merge branch develop')).toBeNull();
		expect(parseSubject('feat:missing space')).toBeNull();
	});
});

describe('renderSection', () => {
	const commits = [
		{ subject: 'feat(meds): dose logging with "All taken" (M3) (#19)' },
		{ subject: 'fix(ui): show the whole entry time, including AM/PM (#18)' },
		{ subject: 'test(admin): fix a shared-database race (#17)' },
		{ subject: 'chore: bump' },
		{ subject: 'docs: backup times' },
		{ subject: 'refactor(db): shared writeTx', body: 'BREAKING CHANGE: new table layout' },
		{ subject: 'not conventional' }
	];

	it('groups by type in a fixed order and leaves out tests and chores', () => {
		expect(renderSection('0.1.0', '2026-10-18', commits)).toBe(
			[
				'## 0.1.0 (2026-10-18)',
				'',
				'### Breaking changes',
				'',
				'- **db:** shared writeTx',
				'',
				'### Features',
				'',
				'- **meds:** dose logging with "All taken" (M3) (#19)',
				'',
				'### Fixes',
				'',
				'- **ui:** show the whole entry time, including AM/PM (#18)',
				'',
				'### Refactoring',
				'',
				'- **db:** shared writeTx',
				'',
				'### Documentation',
				'',
				'- backup times',
				''
			].join('\n')
		);
	});

	it('says so when nothing user-facing changed', () => {
		expect(renderSection('0.1.1', '2026-10-19', [{ subject: 'ci: cache' }])).toContain(
			'No user-facing changes.'
		);
	});
});

describe('prependSection and extractSection', () => {
	it('keeps newest first under one title and finds each version', () => {
		const one = prependSection('', renderSection('0.1.0', '2026-10-18', [{ subject: 'feat: first' }]));
		const two = prependSection(one, renderSection('0.2.0', '2026-11-01', [{ subject: 'fix: second' }]));
		expect(two.startsWith('# Changelog\n\n## 0.2.0 (2026-11-01)')).toBe(true);
		expect(two.match(/# Changelog/g)).toHaveLength(1);
		expect(extractSection(two, '0.2.0')).toBe('### Fixes\n\n- second');
		expect(extractSection(two, '0.1.0')).toBe('### Features\n\n- first');
		expect(extractSection(two, '0.3.0')).toBeNull();
		// 0.1.0 must not match a 0.1.0-rc section or 0.1.00.
		expect(extractSection('# Changelog\n\n## 0.1.0-rc.1 (x)\n\n- a\n', '0.1.0')).toBeNull();
	});
});

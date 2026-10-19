#!/usr/bin/env node
/**
 * Prepares a release on a release/vX.Y.Z branch (docs/RELEASING.md). Used by the "Prepare release" workflow and by hand:
 *
 *   node scripts/release-prep.mjs 0.2.0
 *
 * It sets the version in package.json and package-lock.json, moves the pinned image tag in the files that name it, and adds
 * the version's section to CHANGELOG.md. It commits nothing. Works on Node 22.12+ and 24.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Files that pin the image tag for people deploying (compose.yaml is the one the Pi runs). */
export const TAGGED_FILES = ['compose.yaml', 'README.md', '.env.example'];

const VERSION = /^\d+\.\d+\.\d+$/;

/** Replaces every `mydaybook:<from>` with `mydaybook:<to>`; returns the new text and how many were replaced. */
export function retag(text, from, to) {
	// Not followed by more version digits, so 0.1.0 never matches inside 0.1.01 or 0.1.0.1.
	const pattern = new RegExp(`mydaybook:${from.replaceAll('.', '\\.')}(?!\\d|\\.\\d)`, 'g');
	let count = 0;
	const out = text.replace(pattern, () => {
		count++;
		return `mydaybook:${to}`;
	});
	return { text: out, count };
}

/** True when `next` is a higher X.Y.Z than `current`. */
export function isNewer(current, next) {
	const a = current.split('.').map(Number);
	const b = next.split('.').map(Number);
	for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return b[i] > a[i];
	return false;
}

function fail(message) {
	console.error(message);
	process.exit(1);
}

function main(argv) {
	const version = argv[0];
	if (!version || !VERSION.test(version)) fail('Usage: node scripts/release-prep.mjs <X.Y.Z>');
	const current = JSON.parse(readFileSync('package.json', 'utf8')).version;
	if (!isNewer(current, version)) fail(`${version} is not newer than the current version ${current}`);

	// npm keeps package.json and package-lock.json in step; no tag, no commit.
	execFileSync('npm', ['version', version, '--no-git-tag-version'], {
		stdio: ['ignore', 'ignore', 'inherit'],
		shell: process.platform === 'win32'
	});

	for (const file of TAGGED_FILES) {
		const { text, count } = retag(readFileSync(file, 'utf8'), current, version);
		if (count === 0) fail(`${file} does not mention mydaybook:${current}; check it by hand`);
		writeFileSync(file, text);
		console.log(`${file}: image tag ${current} -> ${version}`);
	}

	execFileSync(process.execPath, ['scripts/changelog.mjs', version], { stdio: 'inherit' });
	console.log(`Ready: review CHANGELOG.md, then commit "chore(release): ${version}"`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));

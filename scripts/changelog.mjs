#!/usr/bin/env node
/**
 * Changelog from Conventional Commits (CLAUDE.md "Git workflow"). Used on a release/vX.Y.Z branch and by the release
 * workflow:
 *
 *   node scripts/changelog.mjs 0.1.0            prepend a "## 0.1.0" section to CHANGELOG.md (commits since the last tag)
 *   node scripts/changelog.mjs --extract 0.1.0  print that section, e.g. for the GitHub release notes
 *
 * Squash-merged PR titles are the commit subjects, so each feature PR becomes one line.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Sections in the order they are shown. Types not listed here (test, ci, chore, build, style) are left out. */
const SECTIONS = [
	['feat', 'Features'],
	['fix', 'Fixes'],
	['perf', 'Performance'],
	['refactor', 'Refactoring'],
	['docs', 'Documentation']
];

const SUBJECT = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<breaking>!)?: (?<text>.+)$/;

/** Parses one commit subject; null when it is not a Conventional Commit. */
export function parseSubject(subject) {
	const m = SUBJECT.exec(subject.trim());
	if (!m?.groups) return null;
	const { type, scope, breaking, text } = m.groups;
	return { type, scope: scope ?? null, breaking: breaking === '!', text };
}

/**
 * Renders a "## <version> (<date>)" section. `commits` are `{ subject, body }`; a "BREAKING CHANGE:" footer or a "!" after
 * the type puts the entry in a Breaking changes list as well.
 */
export function renderSection(version, date, commits) {
	const groups = new Map(SECTIONS.map(([type]) => [type, []]));
	const breaking = [];
	for (const { subject, body = '' } of commits) {
		const c = parseSubject(subject);
		if (!c) continue;
		const line = c.scope ? `**${c.scope}:** ${c.text}` : c.text;
		if (c.breaking || /^BREAKING[ -]CHANGE:/m.test(body)) breaking.push(line);
		groups.get(c.type)?.push(line);
	}
	const out = [`## ${version} (${date})`, ''];
	if (breaking.length > 0) out.push('### Breaking changes', '', ...breaking.map((l) => `- ${l}`), '');
	for (const [type, title] of SECTIONS) {
		const lines = groups.get(type);
		if (lines.length > 0) out.push(`### ${title}`, '', ...lines.map((l) => `- ${l}`), '');
	}
	if (out.length === 2) out.push('No user-facing changes.', '');
	return out.join('\n');
}

/** The body of one version's section in a changelog (without its heading), or null when it is not there. */
export function extractSection(changelog, version) {
	const lines = changelog.split('\n');
	const start = lines.findIndex((l) => l.startsWith(`## ${version} `) || l === `## ${version}`);
	if (start < 0) return null;
	let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
	if (end < 0) end = lines.length;
	return lines
		.slice(start + 1, end)
		.join('\n')
		.trim();
}

/** Puts a new section under the title, above older sections. */
export function prependSection(changelog, section) {
	const title = '# Changelog';
	const rest = changelog.startsWith(title)
		? changelog.slice(title.length).trimStart()
		: changelog.trimStart();
	return `${title}\n\n${section.trimEnd()}\n${rest ? `\n${rest}` : ''}`;
}

function git(args) {
	return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function commitsSinceLastTag() {
	let range = 'HEAD';
	try {
		range = `${git(['describe', '--tags', '--abbrev=0', '--match', 'v*'])}..HEAD`;
	} catch {
		// No release tag yet: the whole history.
	}
	const raw = git(['log', '--no-merges', '--format=%s%x1f%b%x1e', range]);
	return raw
		.split('\x1e')
		.map((r) => r.trim())
		.filter(Boolean)
		.map((r) => {
			const [subject, body] = r.split('\x1f');
			return { subject, body: body ?? '' };
		});
}

function main(argv) {
	const file = 'CHANGELOG.md';
	if (argv[0] === '--extract') {
		const version = argv[1];
		const section = version && existsSync(file) ? extractSection(readFileSync(file, 'utf8'), version) : null;
		if (!section) {
			console.error(`No section for ${version ?? '(missing version)'} in ${file}`);
			process.exit(1);
		}
		process.stdout.write(`${section}\n`);
		return;
	}
	const version = argv[0];
	if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
		console.error('Usage: node scripts/changelog.mjs <X.Y.Z> | --extract <X.Y.Z>');
		process.exit(1);
	}
	const today = new Date().toISOString().slice(0, 10);
	const section = renderSection(version, today, commitsSinceLastTag());
	const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
	if (extractSection(current, version) !== null) {
		console.error(`${file} already has a section for ${version}`);
		process.exit(1);
	}
	writeFileSync(file, prependSection(current, section));
	console.log(`Added ${version} to ${file}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));

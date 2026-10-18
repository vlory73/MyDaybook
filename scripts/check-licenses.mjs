// CI licence check. Fails on any package or static asset outside the policy in license-policy.mjs.
//  - "Shipped" packages (production dependencies, plus the runtime code SvelteKit bundles into the build)
//    must be MIT/BSD/ISC/Apache-2.0 (or CC0/CC-BY for data).
//  - Build and test tooling may additionally be BlueOak-1.0.0 or Python-2.0 (D22).
//  - Every file in static/ must be listed in static/ASSET_LICENSES.json with an allowed licence.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { ASSET, FONT_EXTRA, SHIPPED, TOOLING_EXTRA, satisfies, union } from './license-policy.mjs';

const root = process.cwd();
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
// Dev dependencies whose runtime code ends up in the build output (bundled by Vite/adapter-node).
const BUNDLED_ROOTS = ['svelte', '@sveltejs/kit'];

function readPkg(dir) {
	return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
}

/** Resolves `name` the way Node does, starting from `fromDir`. */
function resolveDir(name, fromDir) {
	let dir = fromDir;
	for (;;) {
		const candidate = join(dir, 'node_modules', name);
		if (existsSync(join(candidate, 'package.json'))) return candidate;
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

/** Runtime dependency closure (dependencies + optional + peer) of the given roots. */
function closure(names, fromDir) {
	const seen = new Set();
	const stack = names.map((n) => [n, fromDir]);
	while (stack.length) {
		const [name, from] = stack.pop();
		const dir = resolveDir(name, from);
		if (!dir || seen.has(dir)) continue;
		seen.add(dir);
		const p = readPkg(dir);
		for (const dep of Object.keys({ ...p.dependencies, ...p.optionalDependencies })) stack.push([dep, dir]);
	}
	return seen;
}

const shippedDirs = closure([...Object.keys(pkg.dependencies ?? {}), ...BUNDLED_ROOTS], root);

const report = JSON.parse(
	execFileSync('npx', ['--no-install', 'license-checker-rseidelsohn', '--json', '--excludePrivatePackages'], {
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024
	})
);

const shippedAllowed = union(SHIPPED, ASSET);
const toolingAllowed = union(SHIPPED, ASSET, TOOLING_EXTRA);
const problems = [];
let shippedCount = 0;
for (const [id, info] of Object.entries(report)) {
	const licenses = Array.isArray(info.licenses) ? info.licenses.join(' OR ') : (info.licenses ?? 'UNKNOWN');
	const shipped = shippedDirs.has(info.path);
	if (shipped) shippedCount++;
	if (!satisfies(licenses, shipped ? shippedAllowed : toolingAllowed)) {
		problems.push(`${shipped ? 'shipped' : 'tooling'} package ${id}: ${licenses}`);
	}
}

// Static assets
const manifest = JSON.parse(readFileSync('static/ASSET_LICENSES.json', 'utf8')).files;
const walk = (dir) =>
	readdirSync(dir).flatMap((f) =>
		statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]
	);
for (const file of walk('static')) {
	const rel = relative('static', file);
	if (rel === 'ASSET_LICENSES.json') continue;
	const entry = manifest[rel];
	const isFont = /\.(woff2?|ttf|otf)$/i.test(rel);
	const allowed = union(SHIPPED, ASSET, isFont ? FONT_EXTRA : new Set());
	if (!entry) problems.push(`static/${rel}: not listed in static/ASSET_LICENSES.json`);
	else if (!satisfies(entry.license, allowed)) problems.push(`static/${rel}: ${entry.license}`);
}
for (const rel of Object.keys(manifest)) {
	if (!existsSync(join('static', rel))) problems.push(`static/ASSET_LICENSES.json lists missing file ${rel}`);
}

if (problems.length) {
	console.error(`Licence check failed:\n  ${problems.join('\n  ')}`);
	process.exit(1);
}
console.log(
	`Licence check passed: ${Object.keys(report).length} packages (${shippedCount} shipped), ${Object.keys(manifest).length} static assets.`
);

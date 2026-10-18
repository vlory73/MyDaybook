// Renders the PWA/iOS PNG icons from the SVG artwork. Usage: node scripts/render-icons.mjs
// Needs the Playwright Chromium browser (dev only). The output PNGs are committed.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

// Full-bleed square (platforms apply their own mask). The art sits inside the maskable safe zone.
const art = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#a94e2e"/><circle cx="256" cy="214" r="62" fill="#f6c29c"/><path d="M116 300c50-26 98-26 140 4 42-30 90-30 140-4v96c-50-24-98-24-140 6-42-30-90-30-140-6z" fill="#faf6f0"/><path d="M256 304v98" stroke="#a94e2e" stroke-width="10"/></svg>`;
const outputs = [
	['static/icon-192.png', 192],
	['static/icon-512.png', 512],
	['static/icon-maskable-512.png', 512],
	['static/apple-touch-icon.png', 180]
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [path, size] of outputs) {
	await page.setViewportSize({ width: size, height: size });
	await page.setContent(
		`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${art}`
	);
	await writeFile(path, await page.screenshot({ type: 'png' }));
	console.log('wrote', path);
}
await browser.close();

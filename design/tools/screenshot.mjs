// Render every mockup at iPhone width (375 x 812 CSS px, 2x) in light and dark.
// Usage: node design/tools/screenshot.mjs  (needs the `playwright` package; set DESIGN_DIR when running a copy elsewhere)
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = process.env.DESIGN_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const path = join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!path.startsWith(dir)) throw new Error('outside');
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

const pages = (await readdir(dir)).filter((f) => f.endsWith('.html') && f !== 'index.html');
const browser = await chromium.launch();
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, colorScheme: scheme });
  const page = await ctx.newPage();
  for (const f of pages) {
    await page.goto(`${base}/${f}`, { waitUntil: 'networkidle' });
    const name = f.replace('.html', '');
    // The design-system sheet is a long page; the screens are single phone frames.
    await page.screenshot({ path: join(dir, 'screenshots', `${name}-${scheme}.png`), fullPage: name === 'system' });
    console.log('shot', name, scheme);
    // Scrolling screens also get a full-length capture so below-the-fold content can be reviewed.
    if (name !== 'system') {
      const tall = await page.evaluate(() => {
        const phone = document.querySelector('.phone');
        phone.classList.add('long');
        return phone.scrollHeight > 812;
      });
      if (tall) await page.screenshot({ path: join(dir, 'screenshots', `${name}-${scheme}-full.png`), fullPage: true });
    }
  }
  await ctx.close();
}
await browser.close();
server.close();

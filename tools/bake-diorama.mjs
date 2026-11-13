import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'assets/diorama-pilot');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    const contents = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    response.end(contents);
  } catch {
    response.writeHead(404).end();
  }
});

let browser;
try {
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const url = `http://127.0.0.1:${server.address().port}/tools/diorama/bake.html`;
  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox'], headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1460, height: 780 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => window.dioramaReady === true, null, { timeout: 60000 });
  if (errors.length) throw new Error(errors.join('\n'));

  const atlases = await page.evaluate(() => Object.fromEntries(
    Object.entries(window.dioramaBake).map(([type, built]) => [type, {
      png: built.canvas.toDataURL('image/png').split(',')[1],
      metadata: built.metadata,
    }])
  ));
  await mkdir(output, { recursive: true });
  for (const atlas of Object.values(atlases)) {
    await writeFile(resolve(output, atlas.metadata.image), Buffer.from(atlas.png, 'base64'));
    await writeFile(resolve(output, atlas.metadata.image.replace('.png', '.json')),
      JSON.stringify(atlas.metadata, null, 2) + '\n');
  }
  await page.screenshot({ path: resolve(root, 'docs/art-directions/diorama-pilot-preview.png'), fullPage: true });
  process.stdout.write(`Baked diorama, sculpted-pixel, and horror sniper/walker atlases into ${output}\n`);
} finally {
  await browser?.close();
  server.close();
}

import { chromium } from 'playwright-core';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { businessRoot } from '../shared/config.ts';

// Use the approved transparent cutout; the supplied original includes an exterior gray matte.
const source = await readFile(path.join(businessRoot, 'assets', 'project-icon-transparent.png'));
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});
try {
  const page = await browser.newPage();
  const sizes: [string, number][] = [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]];
  const outputs = new Map<string, Buffer>();
  for (const [name, size] of sizes) {
    const data = await page.evaluate(async ({ source, size }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${source}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const context = canvas.getContext('2d')!;
      context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, size, size);
      for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]) {
        if (context.getImageData(x, y, 1, 1).data[3] !== 0) throw new Error('Icon corners must remain transparent');
      }
      return canvas.toDataURL('image/png').split(',')[1];
    }, { source: source.toString('base64'), size });
    outputs.set(name, Buffer.from(data, 'base64'));
  }
  outputs.set('icon.svg', Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/png;base64,${outputs.get('icon-512.png')!.toString('base64')}"/></svg>`));
  for (const folder of ['public', 'research-pwa']) {
    const root = path.join(businessRoot, 'frontend', folder, 'icons');
    await mkdir(root, { recursive: true });
    for (const [name, data] of outputs) await writeFile(path.join(root, name), data);
  }
  console.log('Generated app icons from assets/project-icon-transparent.png.');
} finally {
  await browser.close();
}

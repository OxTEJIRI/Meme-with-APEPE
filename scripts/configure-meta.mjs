import { readFile, writeFile } from 'node:fs/promises';

const hostname = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
if (hostname) {
  const origin = new URL(hostname.startsWith('https://') ? hostname : `https://${hostname}`).origin;
  const file = new URL('../dist/index.html', import.meta.url);
  const html = await readFile(file, 'utf8');
  await writeFile(file, html.replace(/(<meta property="og:image" content=")[^"]*(">)/, `$1${origin}/assets/social-preview.jpg$2`));
}

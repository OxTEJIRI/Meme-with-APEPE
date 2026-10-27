import { readFile, stat } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { memes } from '../dist/memes.mjs';
const base = new URL('../dist/', import.meta.url);
assert.equal(memes.length, 25);
assert.equal(new Set(memes.map(m => m.id)).size, 25);
for (const file of ['index.html', 'styles.css', 'app.mjs', 'sound.mjs', 'puzzle.mjs', 'favicon.png', 'manifest.webmanifest', 'assets/apepe-emblem.webp', 'assets/apepe-icon-180.png', 'assets/apepe-icon-192.png', 'assets/apepe-icon-512.png', 'assets/audio/victory-voice.mp3', 'assets/audio/neon-lily.mp3', 'assets/apepe-pointing.webp']) {
  assert.ok((await stat(new URL(file, base))).size > 0, file);
}
for (const meme of memes) {
  const bytes = await readFile(new URL(meme.src, base));
  assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
  assert.ok(bytes.length < 500000, `${meme.title} exceeds the web image budget`);
}
console.log(`Verified 25 web images and required game files in ${fileURLToPath(base)}`);

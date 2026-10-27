import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makePuzzle, swapPieces, findHint, countCorrect, isSolved, formatTime } from '../dist/puzzle.mjs';

function seeded(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

for (const size of [3, 4]) {
  test(`${size}×${size}: random boards have every piece exactly once and start fully shuffled`, () => {
    for (let seed = 1; seed <= 120; seed++) {
      const tiles = makePuzzle(size, seeded(seed));
      assert.deepEqual([...tiles].sort((a, b) => a - b), Array.from({ length: size * size }, (_, i) => i));
      assert.equal(countCorrect(tiles), 0);
    }
  });
  test(`${size}×${size}: directional hints make progress and can always finish a puzzle`, () => {
    for (let seed = 1; seed <= 80; seed++) {
      let tiles = makePuzzle(size, seeded(seed));
      let steps = 0;
      while (!isSolved(tiles)) {
        const before = countCorrect(tiles);
        const hint = findHint(tiles);
        assert.equal(tiles[hint.from], hint.to);
        tiles = swapPieces(tiles, hint.from, hint.to);
        assert.ok(countCorrect(tiles) > before);
        assert.ok(++steps < size * size);
      }
      assert.equal(findHint(tiles), null);
    }
  });
}

test('constant random values still produce playable boards', () => {
  for (const random of [() => 0, () => 0.999999, () => 1]) {
    for (const size of [3, 4]) assert.equal(countCorrect(makePuzzle(size, random)), 0);
  }
});

test('swaps are reversible and do not mutate the original board', () => {
  const tiles = [2, 0, 1];
  const swapped = swapPieces(tiles, 0, 2);
  assert.deepEqual(tiles, [2, 0, 1]);
  assert.deepEqual(swapPieces(swapped, 0, 2), tiles);
  assert.throws(() => swapPieces(tiles, -1, 2), RangeError);
  assert.throws(() => swapPieces(tiles, 1.5, 2), RangeError);
});

test('empty data is not a win and elapsed time handles minute boundaries', () => {
  assert.equal(isSolved([]), false);
  assert.equal(formatTime(59999), '0:59');
  assert.equal(formatTime(60000), '1:00');
  assert.equal(formatTime(3678000), '61:18');
});

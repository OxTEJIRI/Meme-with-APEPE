export function shuffled(values, random = Math.random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function makePuzzle(size, random = Math.random) {
  if (![3, 4].includes(size)) throw new RangeError('Choose a 3×3 or 4×4 puzzle.');
  const ordered = Array.from({ length: size * size }, (_, i) => i);
  for (let attempt = 0; attempt < 80; attempt++) {
    const candidate = shuffled(ordered, random);
    if (candidate.every((piece, position) => piece !== position)) return candidate;
  }
  // A rotation remains a valid, fully scrambled puzzle even with a degenerate RNG.
  return [...ordered.slice(1), ordered[0]];
}

export function swapPieces(tiles, from, to) {
  if (![from, to].every(index => Number.isInteger(index) && index >= 0 && index < tiles.length)) {
    throw new RangeError('Choose two positions on the board.');
  }
  const result = [...tiles];
  [result[from], result[to]] = [result[to], result[from]];
  return result;
}

export const countCorrect = tiles => tiles.filter((piece, position) => piece === position).length;
export const isSolved = tiles => tiles.length > 0 && countCorrect(tiles) === tiles.length;

export function findHint(tiles) {
  const from = tiles.findIndex((piece, position) => piece !== position);
  if (from === -1) return null;
  return { from, to: tiles[from], piece: tiles[from] };
}

export function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

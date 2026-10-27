import { memes } from './memes.mjs';
import { createGameSound } from './sound.mjs';
import { shuffled, makePuzzle, swapPieces, countCorrect, isSolved, findHint, formatTime } from './puzzle.mjs';

const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['board', 'welcome', 'generate-button', 'phase-title', 'puzzle-size', 'instruction', 'round-stats', 'board-controls', 'hint-button', 'new-button', 'side-guide', 'guide-image', 'meme-title', 'mascot-note', 'countdown', 'countdown-number', 'preview-meter', 'preview-progress', 'time-value', 'moves-value', 'placed-value', 'hint-path', 'hint-line', 'announcement', 'win-dialog', 'win-image', 'win-summary', 'download-button', 'confetti', 'collection-count', 'guide-dialog', 'large-guide-image', 'guide-title', 'toast'].map(id => [id, $(id)]));
const tileElements = new Map();
const state = { phase: 'idle', difficulty: 3, size: 3, tiles: [], current: null, selected: null, hint: null, moves: 0, hints: 0, elapsed: 0, preview: 0, stall: 0, round: 0 };
let deck = [], lastMemeId = null, frame = null, previousTime = null, shuffleTimeout = null, winTimeout = null, toastTimeout = null, drag = null, suppressClickUntil = 0;
const completed = readCompleted();
const sound = createGameSound(status => {
  document.body.dataset.audioState = status;
  $('voice-status').textContent = status === 'playing' ? 'Victory announcement playing.' : status === 'unavailable' ? 'Voice could not play. Use Replay victory voice to try again.' : '';
  $('replay-voice').textContent = status === 'playing' ? 'Replay victory voice · Playing' : 'Replay victory voice';
}, status => {
  document.body.dataset.musicState = status;
  $('music-button').title = status === 'unavailable' ? 'Music could not load. Tap to retry.' : status === 'playing' ? 'Neon Lily · Background music playing' : 'APEPE background soundtrack';
  $('music-start-prompt').hidden = !['blocked', 'unavailable'].includes(status);
  $('music-start').textContent = status === 'unavailable' ? 'Retry music' : 'Tap to start music';
  updateSoundButton();
});
function updateSoundButton() {
  $('sound-button').setAttribute('aria-pressed', String(sound.enabled));
  $('sound-button').setAttribute('aria-label', sound.enabled ? 'Sound on. Mute all audio.' : 'Sound off. Turn all audio on.');
  $('sound-label').textContent = sound.enabled ? 'Sound on' : 'Sound off';
  $('music-button').setAttribute('aria-pressed', String(sound.enabled && sound.musicEnabled));
  const needsTap = ['blocked', 'unavailable'].includes(document.body.dataset.musicState);
  $('music-button').setAttribute('aria-label', sound.enabled && sound.musicEnabled ? (needsTap ? 'Start background music' : 'Music on. Turn background music off.') : 'Music off. Turn background music on.');
  $('music-label').textContent = sound.enabled && sound.musicEnabled ? (needsTap ? 'Start music' : 'Music on') : 'Music off';
}

function readCompleted() {
  try {
    const values = JSON.parse(localStorage.getItem('apepe-completed-v1') || '[]');
    return new Set(Array.isArray(values) ? values.filter(id => memes.some(m => m.id === id)) : []);
  } catch { return new Set(); }
}
function updateCollection() {
  ui['collection-count'].textContent = `${completed.size} / 25 memes solved.`;
  $('collection-total').textContent = `${completed.size} / 25`;
  $('collection-progress').setAttribute('aria-valuenow', String(completed.size));
  $('collection-fill').style.width = `${completed.size / 25 * 100}%`;
}
function announce(message) { ui.announcement.textContent = message; }
function instruct(message, kind = '') { ui.instruction.textContent = message; ui.instruction.className = `instruction${kind ? ` is-${kind}` : ''}`; }
function toast(message) {
  clearTimeout(toastTimeout); ui.toast.textContent = message; ui.toast.hidden = false;
  toastTimeout = setTimeout(() => { ui.toast.hidden = true; }, 3500);
}
function setPhase(phase) {
  state.phase = phase; document.body.dataset.phase = phase;
  ui.board.classList.toggle('is-playing', phase === 'playing');
  ui.board.classList.toggle('is-shuffling', phase === 'shuffling');
  ui.board.classList.toggle('is-won', phase === 'won');
  ui.welcome.hidden = !['idle', 'loading'].includes(phase);
  ui['round-stats'].hidden = !state.current;
  ui['board-controls'].hidden = !state.current;
  ui['side-guide'].hidden = !state.current;
  ui.countdown.hidden = phase !== 'preview'; ui['preview-meter'].hidden = phase !== 'preview';
  ui['hint-button'].disabled = phase !== 'playing';
  ui['new-button'].disabled = ['loading', 'preview', 'shuffling'].includes(phase);
  ui['generate-button'].disabled = phase === 'loading';
  ui['generate-button'].querySelector('span').textContent = phase === 'loading' ? 'Finding your meme…' : 'Generate meme image';
  for (const button of document.querySelectorAll('[data-size]')) button.disabled = ['loading', 'preview', 'shuffling'].includes(phase);
  for (const tile of tileElements.values()) tile.disabled = phase !== 'playing';
  const titles = { idle: 'Ready when you are', loading: 'Loading your next mission…', preview: 'Memorize the meme. 5 seconds.', shuffling: 'Shuffling the pieces…', playing: 'Restore the meme', won: 'Mission complete. Meme restored.' };
  ui['phase-title'].textContent = titles[phase];
}

function nextMeme() {
  if (!deck.length) {
    deck = shuffled(memes);
    if (deck.length > 1 && deck[deck.length - 1].id === lastMemeId) [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
  }
  const meme = deck.pop(); lastMemeId = meme.id; return meme;
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image(); image.decoding = 'async';
    const timeout = setTimeout(() => { image.onload = image.onerror = null; image.src = ''; reject(new Error('Image loading timed out')); }, 18000);
    image.onload = async () => {
      clearTimeout(timeout);
      try { await image.decode(); resolve(image); } catch (error) { reject(error); }
    };
    image.onerror = () => { clearTimeout(timeout); reject(new Error('Image could not load')); };
    image.src = src;
  });
}
function stopClock() { if (frame !== null) cancelAnimationFrame(frame); frame = null; previousTime = null; }
function startClock() { stopClock(); frame = requestAnimationFrame(tick); }
function tick(now) {
  const delta = previousTime === null ? 0 : Math.min(1000, Math.max(0, now - previousTime)); previousTime = now;
  const paused = document.hidden || !!document.querySelector('dialog[open]');
  if (!paused && state.phase === 'preview') {
    state.preview += delta;
    const count = String(Math.max(1, Math.ceil((5000 - state.preview) / 1000)));
    if (ui['countdown-number'].textContent !== count) {
      ui['countdown-number'].textContent = count;
      sound.cue('countdown');
    }
    ui['preview-progress'].style.transform = `scaleX(${Math.max(0, 1 - state.preview / 5000)})`;
    if (state.preview >= 5000) scramble();
  } else if (!paused && state.phase === 'playing') {
    state.elapsed += delta; state.stall += delta;
    const time = formatTime(state.elapsed);
    if (ui['time-value'].textContent !== time) ui['time-value'].textContent = time;
    if (state.stall >= 30000 && !state.hint && !drag) showHint(true);
  }
  if (['preview', 'shuffling', 'playing'].includes(state.phase)) frame = requestAnimationFrame(tick);
  else { frame = null; previousTime = null; }
}

async function startRound() {
  if (state.phase === 'loading') return;
  sound.stop(); void sound.prime();
  const round = ++state.round;
  stopClock(); clearTimeout(shuffleTimeout); clearTimeout(winTimeout); cancelDrag();
  clearHint(); state.selected = null; state.current = null;
  for (const tile of tileElements.values()) tile.remove(); tileElements.clear();
  state.size = state.difficulty; state.tiles = []; state.moves = state.hints = state.elapsed = state.preview = state.stall = 0;
  ui['puzzle-size'].textContent = `${state.size} × ${state.size}`;
  setPhase('loading'); instruct('One fresh meme, coming right up.');
  const meme = nextMeme();
  try {
    await loadImage(meme.src);
    if (round !== state.round) return;
    state.current = meme;
    state.tiles = Array.from({ length: state.size ** 2 }, (_, index) => index);
    ui['guide-image'].src = meme.src; ui['guide-image'].alt = `Original guide: ${meme.title}`;
    ui['meme-title'].textContent = meme.title;
    ui['mascot-note'].textContent = 'A calm mind finds the pieces.';
    buildBoard(); setPhase('preview'); updateStats();
    ui['countdown-number'].textContent = '5'; ui['preview-progress'].style.transform = 'scaleX(1)';
    sound.cue('countdown');
    instruct('Remember the details. The pieces will shuffle in 5 seconds.');
    announce(`${meme.title}. Study the complete meme for five seconds. The puzzle will then shuffle.`);
    startClock();
  } catch {
    if (round !== state.round) return;
    state.current = null; setPhase('idle');
    instruct('This meme couldn’t load. Check your connection and try again.', 'error');
    announce('The image could not load. Use Generate meme image to try again.');
  }
}

function buildBoard() {
  ui.board.style.setProperty('--size', state.size);
  for (let piece = 0; piece < state.size ** 2; piece++) {
    const tile = document.createElement('button'); tile.type = 'button'; tile.className = 'tile';
    tile.style.backgroundImage = `url("${state.current.src}")`;
    tile.style.backgroundSize = `${state.size * 100}% ${state.size * 100}%`;
    tile.style.backgroundPosition = `${(piece % state.size) * 100 / (state.size - 1)}% ${Math.floor(piece / state.size) * 100 / (state.size - 1)}%`;
    tile.style.setProperty('--twist', `${piece % 2 ? -2.6 : 2.6}deg`);
    tile.addEventListener('click', () => { if (performance.now() >= suppressClickUntil) selectPiece(piece); });
    tile.addEventListener('keydown', event => navigateTile(event, piece));
    tile.addEventListener('pointerdown', event => pointerDown(event, piece));
    tile.addEventListener('pointermove', pointerMove); tile.addEventListener('pointerup', pointerUp);
    tile.addEventListener('pointercancel', cancelDrag); tile.addEventListener('lostpointercapture', () => { if (drag) cancelDrag(); });
    tileElements.set(piece, tile); ui.board.insertBefore(tile, ui['hint-path']);
  }
  positionPieces();
}
function positionPieces() {
  state.tiles.forEach((piece, position) => {
    const tile = tileElements.get(piece), row = Math.floor(position / state.size), column = position % state.size;
    tile.style.left = `${column * 100 / state.size}%`; tile.style.top = `${row * 100 / state.size}%`;
    tile.setAttribute('aria-label', `Puzzle piece at row ${row + 1}, column ${column + 1}`);
    tile.setAttribute('aria-pressed', String(state.selected === position));
    tile.classList.toggle('selected', state.selected === position);
  });
}
function scramble() {
  if (state.phase !== 'preview') return;
  setPhase('shuffling'); state.tiles = makePuzzle(state.size); positionPieces(); updateStats();
  sound.cue('go'); instruct('Shuffling the pieces…'); const round = state.round;
  shuffleTimeout = setTimeout(() => {
    if (round !== state.round || state.phase !== 'shuffling') return;
    setPhase('playing'); state.stall = 0;
    instruct('Tap two pieces to swap, or drag one onto another.');
    announce('The puzzle is shuffled. Tap two pieces to swap them, or drag and drop.');
  }, 520);
}
function updateStats() {
  ui['time-value'].textContent = formatTime(state.elapsed); ui['moves-value'].textContent = String(state.moves);
  ui['placed-value'].textContent = `${countCorrect(state.tiles)} / ${state.size ** 2}`;
}
function selectPiece(piece) {
  if (state.phase !== 'playing') return;
  const position = state.tiles.indexOf(piece);
  if (state.selected === position) { sound.cue('select'); state.selected = null; positionPieces(); return; }
  if (state.selected === null) {
    sound.cue('select');
    state.selected = position; positionPieces();
    announce(`Piece at row ${Math.floor(position / state.size) + 1}, column ${position % state.size + 1} selected. Choose another piece to swap.`);
  } else swap(state.selected, position);
}
function swap(from, to) {
  if (state.phase !== 'playing' || from === to) return;
  const before = countCorrect(state.tiles);
  sound.cue('swap');
  state.tiles = swapPieces(state.tiles, from, to); state.moves++; state.selected = null;
  clearHint(); positionPieces(); updateStats();
  if (countCorrect(state.tiles) > before) state.stall = 0;
  instruct('Tap two pieces to swap, or drag one onto another.');
  if (isSolved(state.tiles)) completeRound();
  else announce(`${countCorrect(state.tiles)} of ${state.tiles.length} pieces in place.`);
}
function navigateTile(event, piece) {
  if (state.phase !== 'playing') return;
  const position = state.tiles.indexOf(piece), row = Math.floor(position / state.size), column = position % state.size;
  const moves = { ArrowLeft: [row, Math.max(0, column - 1)], ArrowRight: [row, Math.min(state.size - 1, column + 1)], ArrowUp: [Math.max(0, row - 1), column], ArrowDown: [Math.min(state.size - 1, row + 1), column] };
  if (moves[event.key]) { event.preventDefault(); const [r, c] = moves[event.key]; tileElements.get(state.tiles[r * state.size + c]).focus(); }
}

function pointerDown(event, piece) {
  if (state.phase !== 'playing' || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
  drag = { piece, pointerId: event.pointerId, tile: tileElements.get(piece), x: event.clientX, y: event.clientY, ghost: null };
  drag.tile.setPointerCapture(event.pointerId);
}
function pointerMove(event) {
  if (!drag || event.pointerId !== drag.pointerId || state.phase !== 'playing') return;
  if (!drag.ghost && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 9) {
    const rect = drag.tile.getBoundingClientRect();
    drag.ghost = document.createElement('div'); drag.ghost.className = 'tile drag-ghost';
    drag.ghost.setAttribute('aria-hidden', 'true');
    drag.ghost.style.width = `${rect.width}px`; drag.ghost.style.height = `${rect.height}px`;
    drag.ghost.style.backgroundImage = drag.tile.style.backgroundImage;
    drag.ghost.style.backgroundSize = drag.tile.style.backgroundSize; drag.ghost.style.backgroundPosition = drag.tile.style.backgroundPosition;
    document.body.append(drag.ghost); drag.tile.classList.add('being-dragged');
    drag.width = rect.width; drag.height = rect.height;
    state.selected = null; positionPieces();
  }
  if (drag.ghost) {
    event.preventDefault(); drag.ghost.style.transform = `translate(${event.clientX - drag.width / 2}px,${event.clientY - drag.height / 2}px) rotate(2deg)`;
  }
}
function pointerUp(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const current = drag, moved = !!current.ghost;
  let targetPiece = null;
  if (moved) {
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('button.tile');
    for (const [piece, tile] of tileElements) if (tile === target) targetPiece = piece;
    suppressClickUntil = performance.now() + 350;
  }
  cancelDrag();
  if (moved && targetPiece !== null && targetPiece !== current.piece) swap(state.tiles.indexOf(current.piece), state.tiles.indexOf(targetPiece));
}
function cancelDrag() {
  if (!drag) return;
  const current = drag; drag = null;
  current.ghost?.remove(); current.tile.classList.remove('being-dragged');
  if (current.tile.hasPointerCapture?.(current.pointerId)) current.tile.releasePointerCapture(current.pointerId);
}

function clearHint() {
  state.hint = null; ui['hint-path'].setAttribute('hidden', '');
  for (const tile of tileElements.values()) tile.classList.remove('hint-source', 'hint-target');
}
function showHint(automatic = false) {
  if (state.phase !== 'playing') return;
  const hint = findHint(state.tiles); if (!hint) return;
  clearHint(); state.hint = hint; state.hints++; state.stall = 0;
  tileElements.get(state.tiles[hint.from]).classList.add('hint-source');
  tileElements.get(state.tiles[hint.to]).classList.add('hint-target');
  const center = position => [(position % state.size + .5) * 100 / state.size, (Math.floor(position / state.size) + .5) * 100 / state.size];
  const [x1, y1] = center(hint.from), [x2, y2] = center(hint.to);
  const distance = Math.hypot(x2 - x1, y2 - y1), inset = 5;
  const coordinates = { x1: x1 + (x2 - x1) * inset / distance, y1: y1 + (y2 - y1) * inset / distance, x2: x2 - (x2 - x1) * inset / distance, y2: y2 - (y2 - y1) * inset / distance };
  for (const [key, value] of Object.entries(coordinates)) ui['hint-line'].setAttribute(key, value);
  ui['hint-path'].removeAttribute('hidden');
  instruct(`${automatic ? 'A little help: ' : ''}the gold piece belongs in the blue slot. Swap those two.`, 'hint');
  announce(`Hint: swap the glowing piece at row ${Math.floor(hint.from / state.size) + 1}, column ${hint.from % state.size + 1} with the blue slot at row ${Math.floor(hint.to / state.size) + 1}, column ${hint.to % state.size + 1}.`);
}

function completeRound() {
  const round = state.round; stopClock(); clearHint(); setPhase('won');
  completed.add(state.current.id);
  try { localStorage.setItem('apepe-completed-v1', JSON.stringify([...completed])); } catch { /* Progress is optional when storage is unavailable. */ }
  updateCollection();
  instruct('Mission complete. Your meme is unlocked.');
  ui['win-image'].src = state.current.src; ui['win-image'].alt = `Completed meme: ${state.current.title}`;
  ui['win-summary'].textContent = `${state.current.title} · ${formatTime(state.elapsed)} · ${state.moves} ${state.moves === 1 ? 'swap' : 'swaps'}`;
  ui['download-button'].href = state.current.src; ui['download-button'].download = `apepe-bingx-meme-${state.current.id}.webp`;
  announce('Puzzle complete! MEME WITH APEPE. TRADE WITH BingX.');
  winTimeout = setTimeout(() => {
    if (round !== state.round || state.phase !== 'won') return;
    ui.confetti.replaceChildren();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (let i = 0; i < 22; i++) {
        const bit = document.createElement('i');
        bit.style.setProperty('--dx', `${(i % 2 ? 1 : -1) * (50 + (i * 47) % 230)}px`);
        bit.style.setProperty('--dy', `${140 + (i * 73) % 400}px`); bit.style.setProperty('--dr', `${i * 67}deg`);
        bit.style.animationDelay = `${(i % 5) * 35}ms`; ui.confetti.append(bit);
      }
    }
    ui['win-dialog'].showModal();
    void sound.playVictory();
  }, 480);
}

ui['generate-button'].addEventListener('click', startRound);
ui['new-button'].addEventListener('click', startRound);
ui['hint-button'].addEventListener('click', () => showHint());
$('again-button').addEventListener('click', () => { ui['win-dialog'].close(); startRound(); });
$('sound-button').addEventListener('click', () => { sound.setEnabled(!sound.enabled); updateSoundButton(); });
$('music-button').addEventListener('click', () => {
  if (!sound.enabled) { sound.setMusicEnabled(true); sound.setEnabled(true); }
  else if (['blocked', 'unavailable'].includes(document.body.dataset.musicState)) void sound.prime();
  else sound.setMusicEnabled(!sound.musicEnabled);
  updateSoundButton();
});
$('music-start').addEventListener('click', () => { void sound.prime(); });
document.addEventListener('click', event => {
  if (event.target.closest('#sound-button, #music-button, #music-start')) return;
  if (document.body.dataset.musicState === 'blocked') void sound.prime();
}, { capture: true });
// Delegation covers current and future controls, including keyboard activation.
// Puzzle pieces have their own selection/swap sounds, so they are not doubled.
document.addEventListener('click', event => {
  const control = event.target.closest('button, a[href]');
  if (!control || control.disabled || control.classList.contains('tile')) return;
  sound.cue('button');
});
$('replay-voice').addEventListener('click', () => {
  if (!sound.enabled) { sound.setEnabled(true); updateSoundButton(); }
  void sound.playVictory();
});
ui['win-dialog'].addEventListener('close', () => sound.stop());
for (const button of document.querySelectorAll('[data-size]')) {
  button.addEventListener('click', () => {
    const size = Number(button.dataset.size); if (size === state.difficulty) return;
    state.difficulty = size;
    for (const option of document.querySelectorAll('[data-size]')) option.setAttribute('aria-pressed', String(Number(option.dataset.size) === size));
    if (['playing', 'won'].includes(state.phase)) startRound(); else { state.size = size; ui['puzzle-size'].textContent = `${size} × ${size}`; }
  });
}
$('help-button').addEventListener('click', () => $('help-dialog').showModal());
$('guide-button').addEventListener('click', () => {
  if (!state.current) return;
  ui['large-guide-image'].src = state.current.src; ui['large-guide-image'].alt = `Original guide: ${state.current.title}`;
  ui['guide-title'].textContent = state.current.title; ui['guide-dialog'].showModal();
});
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => $(button.dataset.close).close());
for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
}
document.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]')) return;
  if (event.key.toLowerCase() === 'h' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); showHint(); }
  if (event.key === 'Escape') { state.selected = null; positionPieces(); }
});
document.addEventListener('visibilitychange', () => { previousTime = null; sound.setHidden(document.hidden); if (document.hidden) cancelDrag(); });
window.addEventListener('blur', cancelDrag);
$('share-button').addEventListener('click', async () => {
  const share = { title: 'Meme with APEPE', text: '25 memes. One mission. Play the APEPE × BingX puzzle arcade.', url: location.href.split('#')[0] };
  try {
    if (navigator.share) { await navigator.share(share); return; }
  } catch (error) { if (error.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(share.url); toast('Game link copied. Send a little mischief.'); }
  catch { toast('Copy the address from your browser to share the game.'); }
});
updateCollection(); updateSoundButton(); setPhase('idle');
sound.setHidden(document.hidden);
sound.startOnOpen();
